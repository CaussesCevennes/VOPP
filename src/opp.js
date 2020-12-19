
function OPP(providers, theme) {

  /* ########################################
     Properties
     ######################################## */

  //public properties should be assigned to the "self" variable representing
  //the object instance, so as to avoid scope confusion when using "this" keyword
  var self = this;

  self.providers = providers; //array of available providers
  self.theme = theme; //json of current theme properties

  self.viewMode = 'SINGLE'; //current view mode for displaying photos, values are :
  // 'SINGLE' : simple view with only one photo,
  // 'SPLIT' : splited window into 2 synchronized photos view,
  // 'SBS' : side by side view with a vertical slider
  // 'SPOT' : magnifying glass effect

  //View map containers
  self.map; //Leaflet main map object
  self.photoMaps = []; //TODO
  self.photoMap1; //Leaflet map object used for displaying the first photo
  self.photoMap2; //Leaflet map object used for displaying the second photo

  //Map hardcoded parameters
  self.phZoomSnap = 0.25;
  self.mapVisco = 0.75;
  self.phImageOverlayMaxZoom = 7;

  //Map controls
  self.tocLayers; //Leaflet control used as layers table of content
  var sbsCtrl; //side by side addon control
  var magnifyingGlass; //magnifying glass addon control

  //Map layers
  self.oppLayers = {}; //dictionnary of Leaflet geojson layergroups of photos markers, one entry for each provider key
  self.markersClusters = {}; //dictionnary of cluster layers, one entry for each provider key
  self.bkgLayers = {}; //dictionnary of Leaflet geojson layergroups used as background layers, one entry for each custom layer key
  self.basemaps = {}; //Leaflet TileLayer objects used as basemaps

  self.oppData = []; //array of objects containing properties of all point of view (used only for fuzzy search)

  //the current selected provider (json properties)
  Object.defineProperty(self, 'activeProvider', {
    get: function() {
      if (self.selectedMark){
        return getProvider(self.selectedFeatProps['PROVIDER']);
      }
    },
    enumerable: true,
  });

  //the current selected marker
  var _selectedMark;
  Object.defineProperty(self, 'selectedMark', {
    get: function() {
      return _selectedMark;
    },
    set: function(newMarker) {
      updateMarker(newMarker);
    },
    enumerable: true,
  });

  //
  Object.defineProperty(self, 'hasSelectedMark', {
    get: function() {return Boolean(self.selectedMark);},
    enumerable: true,
  });
  //alias to the current selected geojson feature
  Object.defineProperty(self, 'selectedFeat', {
    get: function() {return self.selectedMark.feature;},
    enumerable: true,
  });
  //alias to the current selected feature properties
  Object.defineProperty(self, 'selectedFeatProps', {
    get: function() {return self.selectedMark.feature.properties;},
    enumerable: true,
  });

  self.isFiltered = false; //flag if data has been filtered

  self.activeLocIcon; //the Leaflet marker icon used for representing the selected photo
  self.locIcons = {}; //dictionnary of Leaflet marker icons for each providers key

  var fuse; //Fuse search engine

  //how to handle url parameters and browser history
  var registerHistory = false; //flag if urls must be added to history stack
  var registerDates = true; //flag if urls must include dates parameters
  var registerViewMode = true; //flag if urls must include viewmode parameter
  var hideParams = true; //hide url parameters (only possible if registerHistory is false)

  //debug
  var _initUpdatePhotoCpt = 0;

  /* ########################################
     Init methods
     ######################################## */

  var init = function(){
    $('#head').css('color', self.theme['headerTextColor']);
    $('#head').css('background', self.theme['headerBkgColor']);
    $('head title').html(self.theme['title']);
    $('meta[name=description]').attr("content", self.theme['description']);
    $('#title').html(self.theme['title']);
    $('#logo').attr('src', self.theme['headerLogo']);
    $('#toolbar').css('background', self.theme['toolbarColor']);

    $("#toolbar").css('--tb-icon-base-color', self.theme['toolbarIconBaseColor']);
    $("#toolbar").css('--tb-icon-select-color', self.theme['toolbarIconSelectColor']);

    $('#about').load(`${self.theme['about']}?v=${version}`);

    $('.chkBkgPhoto').hide();
    $("#widgets1").show();

    //override providers properties with options submited by the theme
    for (let k in self.theme['providers']){
      let options = self.theme['providers'][k];
      let provider = getProvider(k);
      if (! provider) {
        self.providers.push(self.theme['providers'][k]);
        provider = getProvider(k);
      }
      for (let opt in options){
        provider[opt] = options[opt];
      }
    }

    self.providers = self.providers.filter(p => p['key'] in self.theme['providers']);
    $('#clearSearchBt').hide();
    $('#query').val('');

    //Fill provider drowdown filter
    self.providers.forEach(function(prov) {
      $('#PROVIDER')
        .append($('<option></option>')
        .val(prov.key)
        .html(prov.name)
      );
    });

    //Fetch all required templates files
    var templates = [];
    self.providers.forEach(function(provider){
      templates.push(
        $.ajax(`${provider['infosPanel']}?v=${version}`, {dataType:'html'})
          .then(function(data){
            provider['infosPanelTemplate'] = data;
          })
          .fail(function(jqXHR, textStatus, error){console.error(error)})
      );
    });


    registerHistory = self.theme['browserHistory'];
    if (registerHistory){
      var registerDates = false;
      var registerViewMode = false;
    }

    self.loading = $.when(...templates, setupMap());

    self.loading.then( function() {

      self.refresh(true);
      connectEvents();

      //Setup Fuse engine
      self.fuses = {};
      self.providers.forEach(prov => {
        self.fuses[prov.key] = new Fuse(self.oppData.filter(pov => pov['PROVIDER'] == prov.key), {
          keys: prov.searchKeys,
          threshold: 0.5,
          distance: 50
        });
      })

      if (_initUpdatePhotoCpt > 1) {
        console.debug(`Warning, init sequence updates the photo ${_initUpdatePhotoCpt} times.`)
      }

    });

  }

  /* Create Leaflet map objects for the map and the photos
   > add controls and load geojson layers
   > return a promise of loaded opp layers  */
  var setupMap = function(){

    //extend leaflet map methods
    L.Map.include({
      clearLayers : function () {
        this.eachLayer(function(layer){
          layer.remove();
        });
      },
      getLayers : function (type) {
        var layers = [];
        this.eachLayer(function(layer){
          if (type){
            if (layer instanceof type ){
              layers.push(layer);
            }
          } else {
            layers.push(layer);
          }
        });
        return layers;
      }
    });

    //Create main map
    self.map = L.map('map',{zoomControl:false, center:[46.65, 2.55], zoom:5, maxZoom:20, maxBoundsViscosity: self.mapVisco});

    self.tocLayers = L.control.layers(null, null, {position:'topright'});
    self.tocLayers.addTo(self.map);

    //Load basemaps tile layers
    $.getJSON(`${baseurl}/layers/basemaps.json?v=${version}`, function(basemaps){
      basemaps
        .filter(elem => self.theme.basemaps.includes(elem.key))
        .forEach( (basemap, i) => {
          var layer =  L.tileLayer(basemap.url, {
            attribution: basemap.attribution
          });
          self.basemaps[basemap.key] = layer;
          self.tocLayers.addBaseLayer(layer, basemap.name);
          if (i == 0) {
            self.map.addLayer(layer);
          }
        });
    });

    //add search control
    self.map.addControl( new L.Control.Search({
      position : 'topleft',
      url: 'https://nominatim.openstreetmap.org/search?format=json&q={s}',
      jsonpParam: 'json_callback',
      propertyName: 'display_name',
      propertyLoc: ['lat','lon'],
      marker: false,
      moveToLocation: function(latlng, title, map) {
          var zoom = 13
          self.map.setView(latlng, zoom); // access the zoom
      },
      autoCollapse: true,
      autoType: false,
      minLength: 2
    }) );

    //Add zoom to extent control
    var zoomToExtent = L.control({position: 'topleft'});
    zoomToExtent.onAdd = function (map) {
        let bt = L.DomUtil.create('button', 'zoomToExtentBt');
        bt.title = "Zoomer sur l'étendue de la carte";
        return bt
    };
    zoomToExtent.addTo(self.map);

    //Create photos maps
    var photoCRS = L.CRS.Simple
    var photoMapOptions = {
      zoomControl:false,
      crs: photoCRS,
      center: [0, 0], zoom: 0,
      zoomSnap: self.phZoomSnap,
      maxBoundsViscosity: self.mapVisco
    }
    self.photoMap1 = L.map('photo1', photoMapOptions);
    self.photoMap2 = L.map('photo2', photoMapOptions);
    self.photoMap1.attributionControl.setPrefix('');
    self.photoMap2.attributionControl.setPrefix('');

    //Create azimuth custom control
    self.north = L.control({position: "topright"});
    self.north.onAdd = function(map) {
        var div = L.DomUtil.create("div", "windrose");
        $(div)
          .attr('title', 'Orientation de la photo')
          .append(
            $('<div>').addClass('azimuth')
          );
        return div;
    }
    self.north.addTo(self.photoMap1);

    //Setup maps sync addon
    self.photoMap1.sync(self.photoMap2);
    self.photoMap2.sync(self.photoMap1);

    //Setup side by side addon
    self.photoMap1.createPane('left');
    self.photoMap1.createPane('right');

    //setup jquery resizable addon
    $("#map").resizable({
      handleSelector: "#split1",
      resizeHeight: false,
      resizeWidthFrom: 'right',
      onDrag: function (e, $el) {
          self.map.invalidateSize();
          self.photoMap1.invalidateSize();
          self.photoMap2.invalidateSize();
      }
    });

    $("#sidePanel").resizable({
      handleSelector: "#split2",
      resizeHeight: false,
      resizeWidthFrom: 'left',
      onDrag: function (e, $el) {
          self.map.invalidateSize();
          self.photoMap1.invalidateSize();
          self.photoMap2.invalidateSize();
      }
    });

    loadCustomLayers();

    let oppLayersPromise = loadOppLayers();

    oppLayersPromise.then(function(){
      //zoom to data extent
      self.extent = L.latLngBounds();
      for (let k in self.oppLayers){
        let layer = self.oppLayers[k];
        if (self.providers.find(prov => prov.key === k).enable){
          self.extent.extend(layer.getBounds());
        }
      }
      self.map.flyToBounds(self.extent);
    });

    //constrain map bounds at the end of the fly
    if (self.theme.constrainMapExtent){
      self.map.once("moveend zoomend", function(e){
        self.map.setMaxBounds(self.extent.pad(0.5));
      });
    }

    return oppLayersPromise;

  }

  /* Load OPPs GeoJSON layers of each provider and return a promise*/
  var loadOppLayers = function(){

    var BaseIcon = L.Icon.extend({
        options:{
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            tooltipAnchor: [16, -28],
            shadowSize: [41, 41]
        }
    });

    self.activeLocIcon = new BaseIcon({iconUrl: `${baseurl}/icons/marker_active.svg?v=${version}`});

    if (self.providers.length > 1) {
      var clusterLegend = L.control({position: 'bottomleft'});

      clusterLegend.onAdd = function (map) {
          var div = L.DomUtil.create('div', 'clustersLegend');
          self.providers.forEach(function(provider){
            div.innerHTML += `<div class='clusterLegendContainer'>
              <div id='${provider['key']}' class='clusterLegend hvr-bounce-in'>${provider['shortName']}</div>
              <span class='clusterLegendTooltip'>${provider['name']}</span>
            </div>`;
          });
          return div;
      };
      clusterLegend.addTo(self.map);
    }

    var promises = [];
    self.providers.forEach(function(provider){
      self.locIcons[provider['key']] = new BaseIcon({iconUrl: `${provider['svgMarker']}?v=${version}`});
      promises.push(
        $.getJSON(`${provider['datafile']}?v=${version}`, function(data){

          data.features.forEach(function(feat){
            //Make sure date is of type String
            feat.properties['PHOTOS'].forEach(function(photo){
              photo['DATE'] = String(photo['DATE']);
            });
            //assign the provider key to each features
            feat.properties['PROVIDER'] = provider['key'];
            //seed whole data array for fuzzy search
            self.oppData.push(feat.properties);
            //Assign extra properties callback
            Object.defineProperty(feat.properties, 'GRANULARITY', {
              get: function() {
                var dates = this['PHOTOS'].map(photo => photo['DATE'].split('-'));
                var years = dates.map(date => date[0]);
                var months = dates.map(date => date[1]);
                //if there is no duplicate year then the date granularity is yearly
                if ( ! years.some((item, index) => years.indexOf(item) != index) ) {
                  return 'year';
                //if there are duplicates years but no duplicate month then the date granularity is monthly
                } else if ( ! months.some((item, index) => months.indexOf(item) != index) ) {
                  return 'month';
                } else {
                  return 'day'; //daily granularity
                };
              },
              enumerable: true,
            });
            //Assign extra year, month, day properties to each photo derived from the date
            feat.properties['PHOTOS'].forEach(function(photo){
              Object.defineProperty(photo, 'YEAR', {
                get: function() {
                  //return this['DATE'].split('-')[0] },
                  return new Date(this['DATE']).getFullYear() },
                enumerable: true,
              });
              Object.defineProperty(photo, 'MONTH', {
                get: function() {
                  return this['DATE'].split('-')[1] }, //out of range index will return an undefined value
                enumerable: true,
              });
              Object.defineProperty(photo, 'DAY', {
                get: function() {
                  return this['DATE'].split('-')[2] },
                enumerable: true,
              });
            });
            //year min and year max
            Object.defineProperty(feat.properties, 'YEARMIN', {
              get: function() {
                return Math.min(...this['PHOTOS'].map(photo => photo.YEAR));
              },
              enumerable: true,
            });
            Object.defineProperty(feat.properties, 'YEARMAX', {
              get: function() {
                return Math.max(...this['PHOTOS'].map(photo => photo.YEAR));
              },
              enumerable: true,
            });
          });

          //build marker
          self.oppLayers[provider['key']] = L.geoJson(data,{
            pointToLayer: function (feature, latlng) {
              var marker = L.marker(latlng, {icon: self.locIcons[provider['key']]});
              return marker;
            },
            onEachFeature: function (feature, layer) {
              var popup = L.popup({autoClose: false});
              popup.setContent(Mustache.render(provider['popup'], feature.properties));
              layer.bindPopup(popup);
              layer.on('mouseover', function (e){
                layer.openPopup();
              });
              layer.on('mouseout', function (e){
                layer.closePopup();
              });
              layer.on('click', function (e){
                layer.openPopup();
                markerClickHandler(layer);
              })
            }
          })

          var markersCluster = new L.MarkerClusterGroup(
            {
              attribution : '',
              animate: true,
              showCoverageOnHover: false,
              zoomToBoundsOnClick: true,
              maxClusterRadius: 60, //the default is 80px
              iconCreateFunction: function(cluster) {
                let digits = String(cluster.getChildCount()).length;
                let classes = 'cluster cluster-' + provider['key'] + ' digits-' + digits;
                if (cluster.getAllChildMarkers().find(marker => marker === self.selectedMark)){
                  classes += ' active';
                }
                return L.divIcon({
                  html: cluster.getChildCount(),
                  className: classes,
                  iconSize: null
                });
              }
            });
          self.markersClusters[provider['key']] = markersCluster;
          //add cluster layer
          markersCluster.addLayers(self.oppLayers[provider['key']]);
          if (provider['enable']){
            //self.map.addLayer(markersCluster);
            enableClusterLayer(provider['key']);
          } else {
            disableClusterLayer(provider['key']);
          }
          //self.tocLayers.addOverlay(markersCluster, "Points de vue " + provider['name']);
          //add extra css for stylizing clusters
          $('head').append(
            $('<style>')
              .html(`
                .cluster-${provider['key']} {
                    background: ${provider['clusterColor']};
                    border-color: ${provider['clusterColor']};
                    color: white;
                }`) //TODO set text color to black or white depending on background lightness
            );
        })
      );
    });
    //return a new promise combining all layers promises
    return $.when(...promises);
  }

  /* Load custom GeoJSON layers requested by the theme and return a promise*/
  var loadCustomLayers = function(){

    var promises = [];
    self.theme.layers.forEach(function(layerId){
      let dataUrl = `${baseurl}/data/${layerId}.geojson?v=${version}`;
      let jsUrl = `${baseurl}/layers/${layerId}.js?v=${version}`;
      promises.push(
        $.getJSON(dataUrl, function(data){
          $.getScript(jsUrl, function() {
            //exec of the external script should append a new object into bkgLayers
            let layer = self.bkgLayers[layerId];
            layer.load(data);
            if (layer.enable){
              self.map.addLayer(layer.layer);
            }
            if (layer.legend){
              layer.legend.addTo(self.map);
            }
            if (layer.info){
              layer.info.addTo(self.map);
            }
            self.tocLayers.addOverlay(layer.layer, layer.title);
          });
        })
      );
    });

    //keep toc and displayed legends in synch
    self.map.on('overlayadd', function (event){
      for (let layerId in self.bkgLayers) {
        let layer = self.bkgLayers[layerId];
        if (layer.title === event.name){
          self.map.addControl(layer.legend);
        }
      }
    });
    self.map.on('overlayremove',function (event){
      for (let layerId in self.bkgLayers) {
        let layer = self.bkgLayers[layerId];
        if (layer.title === event.name){
          self.map.removeControl(layer.legend);
        }
      }
    });

    //enable/disable layers depending on zoom level
    self.map.on('zoomend', function () {
      for (let layerId in self.bkgLayers){
        let layer = self.bkgLayers[layerId];
        if (self.map.getZoom() > layer.maxZoom && self.map.hasLayer(layer.layer)){
          self.map.removeLayer(layer.layer);
          layer._hide = true;
        } else if (self.map.getZoom() <= layer.maxZoom && layer._hide){
          self.map.addLayer(layer.layer);
          layer._hide = false;
        }
      }
    });
    //return a new promise combining all layers promises
    return $.when(...promises);
  }



  /* ########################################
     Data model
     ######################################## */

  /* Get a provider properties given it's key */
  var getProvider = function(key){
    return self.providers.find(elem => elem.key == key);
  }

  var hasProvider = function(key){
    return Boolean(getProvider(key));
  }

  var getMarker = function(provId, povId){
    return self.oppLayers[provId]
            .getLayers()
            .find(elem => elem.feature.properties.NUM == povId);
  }


  /* ########################################
  photos methods
  ######################################## */

  /* Return the date key identifier for a given photo. The key is the shortest
  date identifier for a photo according on the POV granularity,
  it can be only the year, year and month or year, month and day */
  var getDateKey = function(photo){
    let granularity = self.selectedFeatProps['GRANULARITY'];
    if (granularity == 'year') {
      return photo['YEAR'];
    } else if (granularity == 'month'){
      /*let month = {
        '01':'Janvier','02':'Février','03':'Mars','04':'Avril',
        '05':'Mai','06':'Juin','07':'Juillet','08':'Aout',
        '09':'Septembre','10':'Octobre','11':'Novembre','12':'Décembre',
      }*/
      return photo['YEAR'] + '-' + photo['MONTH'];
    } else if (granularity == 'day'){
      return photo['YEAR'] + '-' + photo['MONTH'] + '-' + photo['DAY'];
    }
  }

  /* Get a photo from the current active POV, given a target date */
  var getPhoto = function(date){
    /* @param date : the target date in full format yyyy-mm-dd or as date key shortcut */
    let props = self.selectedMark.feature.properties;
    return props['PHOTOS'].find(photo => getDateKey(photo) == date || photo['DATE'] == date);
  }

  /* For the active POV, return the url of a given photo
  Url is building according to the provider's url template */
  var getPhotoUrl = function(photoProps){
    /* @param date : the target date in full format yyyy-mm-dd or as date key shortcut */
    let featProps = self.selectedMark.feature.properties;
    var url = self.activeProvider['photoUrl'];
    //return Mustache.render(url, {...featProps, ...photoProps}); //ECMAScript 2018
    return Mustache.render(url, $.extend({}, featProps, photoProps));
    /*
    for (let prop in featProps) {
      url = url.replace('{{'+prop+'}}', featProps[prop]);
    }
    for (let prop in photoProps) {
      url = url.replace('{{'+prop+'}}', photoProps[prop]);
    }
    return url;
    */
  }


  /* ########################################

                Handlers

  ######################################## */


  /* ########################################
  updates methods
  ######################################## */

  var updateMarker = function(newMarker){
    let oldMarker = self.selectedMark;
    let oldProvider = self.activeProvider;
    //affect
    _selectedMark = newMarker;
    _selectedMark.setIcon(self.activeLocIcon);
    //update icons and active cluster
    if (oldMarker) {
      oldMarker.setIcon(self.locIcons[oldProvider.key]);
      self.markersClusters[self.activeProvider.key].refreshClusters([oldMarker, newMarker]);
      //target clusters will be refreshed only at zoomend event
      //so meanwhile we need to manually unactive the active cluster
      $('.cluster.active').removeClass('active');
    }
    //active provider depends on the current selected marker
    //every time the active provider is potentially updated, we must determine
    //if sketches are available and displaying the corresponding button accordingly
    setupSketchButton();

    //update azimuth
    setAzimuth();

    //Fill infos panel
    let template = self.activeProvider['infosPanelTemplate'];
    let render = Mustache.render(template, self.selectedFeatProps);
    $('#infosPanel').html(render);

  }

  var setAzimuth = function(){
    if (!self.selectedMark){
      return
    }
    let azimuth = self.selectedFeatProps['AZIMUTH'];
    if (azimuth != undefined) {
      $('.windrose').show();
      $('.azimuth').css('transform', `rotate(${azimuth}deg)`);
    } else {
      $('.windrose').hide();
    }
  }

  var markerClickHandler = function(newMarker){
    if (self.selectedMark === newMarker){
      return
    }
    self.selectedMark = newMarker; //trigger updateMarker()
    updateYears();
    updatePhotos();
    updateUrl();
    if (self.isFiltered){
      $('#results>.selected').toggleClass("selected");//unselect
      let id = self.activeProvider.key + '__' + self.selectedFeatProps.NUM;
      $('#results>#'+id).toggleClass("selected");
    };
  }

  var updateTimeline = function(){
    $('#thumbs').empty();
    self.selectedFeatProps['PHOTOS'].forEach( (photo, i) => {
      let dk = getDateKey(photo);
      let thumbUrl = Mustache.render(self.activeProvider.thumbUrl, {...self.selectedFeatProps, ...photo});
      $('#thumbs').append(
        $("<div id="+ dk +" class='photoThumb'></div>")
        .css('background-image', 'url(' + thumbUrl + ')')
        .append(
          $("<div class='thumbDate'></div>").text(dk),
          $("<div id='thumbLink1' class='thumbLink hvr-pop' title='Remplacer la vue 1'></div>").text('1'),
          $("<div id='thumbLink2' class='thumbLink hvr-pop' title='Remplacer la vue 2'></div>").text('2')
        )
      );
    });
  }


  var thumbSelect = function(date, target) {
    if (self.viewMode == 'SINGLE'){
      dropDownDateSelect('#dropDownDate1', date);
    } else {
      if (target == 'thumbLink1') {
        dropDownDateSelect('#dropDownDate1', date);
      } else if (target == 'thumbLink2') {
        dropDownDateSelect('#dropDownDate2', date);
      }
    }
  }

  /* Parse url parameters and update app state according to them. */
  self.refresh = function(init){
    /*
    @param init : boolean that flag if the refresh is triggered by the init
    function (otherwise its triggered by browser history popstate event).
    */

    let urlParams = new URL(window.location).searchParams;
    let requestedProvider = urlParams.get('provider');
    let requestedPOV = urlParams.get('pov');
    let requestedDate1 = urlParams.get('date1');
    let requestedDate2 = urlParams.get('date2');
    let requestedViewMode = urlParams.get('viewmode');

    //Try to get the requested marker
    if (requestedProvider && requestedPOV){
      if (hasProvider(requestedProvider)) {
        self.selectedMark = getMarker(requestedProvider, requestedPOV);
      }
    }
    //If there is no requested marker or if it was not found
    //just select the first provider and the first marker
    if (!self.selectedMark) {
      let providerKey = self.providers[0]['key'];
      self.selectedMark = self.oppLayers[providerKey].getLayers()[0];
    }

    /* Fill years dropdown and select dates. The selected dates will be :
     1. the requested dates if these dates exist in the list
     2. the same dates as previously displayed if they can be found
     3. respectively, the first and the last dates */
    updateYears(requestedDate1, requestedDate2);

    // Toogle the view mode (these functions will trigger updatePhotos())
    if (requestedViewMode == 'SINGLE' && self.viewMode != 'SINGLE'){
      toggleSingleView();
    } else if (requestedViewMode == 'SPLIT' && self.viewMode != 'SPLIT'){
      toggleSplitView();
    } else if (requestedViewMode == 'SBS' && self.viewMode != 'SBS'){
      toggleSbsView();
    } else if (requestedViewMode == 'SPOT' && self.viewMode != 'SPOT'){
      toggleSpotView();
    } else if (init) {
      if (self.theme['viewmode'] == 'SPLIT') {
        toggleSplitView();
      } else if (self.theme['viewmode'] == 'SBS') {
        toggleSbsView();
      } else if (self.theme['viewmode'] == 'SPOT') {
        toggleSpotView();
      } else {
        toggleSingleView();
      }
    } else { //preserve the current view mode and just update the displayed photos
      updatePhotos();
    }

    //update the url because the parameters submitted may be incorrect
    //we don't need to register because refresh is only called by a browser url entry
    updateUrl('doNotRegister');

  }

  /* Fill dropdowns with the available dates for the active Point of View
  and then select a date depending on the context */
  var updateYears = function (targetDate1, targetDate2) {

    dropDownDateOff(); //do not trigger change() event when populate the list

    let selectedDate1 = $('#dropDownDate1').val();
    let selectedDate2 = $('#dropDownDate2').val();
    $('.dropDownDate').empty();

    var photos = self.selectedFeatProps['PHOTOS'];
    photos.sort(function(a, b) {
      return a['DATE'] > b['DATE'];
    });

    photos.forEach(function(photo) {
      let dateKey = getDateKey(photo);
      $('.dropDownDate')
        .append($('<option></option>')
        .val(dateKey)
        .html(dateKey)
      );
    });

    //select the target date or the previous corresponding date or set to default
    if (targetDate1) {
       $('#dropDownDate1').val(targetDate1);
   } else if (self.theme['saveDates'] && ($("#dropDownDate1 [value='" + selectedDate1 + "']").length != 0)) {
       $('#dropDownDate1').val(selectedDate1);
   } else {
       $('#dropDownDate1').val(getDateKey(photos[0])); //first date
   }

   if (targetDate2) {
       $('#dropDownDate2').val(targetDate2);
   } else if (self.theme['saveDates'] && ($("#dropDownDate2 [value='" + selectedDate2 + "']").length != 0)) {
       $('#dropDownDate2').val(selectedDate2);
   } else {
       $('#dropDownDate2').val(getDateKey(photos[photos.length - 1])); //last
   }
    $('.dropDownDate').change();

    updateTimeline();
    synchTimeline();

    dropDownDateOn();

  }


  /* In Leaflet, the simple CRS option produce a coordinate system of 1000x1000 units
  When using with tilelayer, one pixel = one units, so the first tile of 256px will represent 256units
  on another side, when using with overlayImage there is no particular limitation, it's possible to set
  the image bounds to any coordinates. To allows alignement of photos whatever they are displayed as
  imageOverlay or tileLayer we have to choose a base canvas size of 256 units.
  This function compute the bounding box that fits the photo inside a canvas of 256 units
  The largest dimension of the image will be represented by 256 units, the other dimension
  will be evaluated accordingly with the ratio.
  The ratio is a property of the point of view. A same point can have multiple photos
  with various resolutions but always the same ratio. */
  var getPhotoBoundsFromRatio = function (ratio){
    let baseCanvasSize = 256; //define the width of the photo in the canvas (or the height for vertical photo)
    if (ratio >= 1){ //width larger than height
      var w = baseCanvasSize;
      var h = w / ratio;
    } else {
      var h = baseCanvasSize;
      var w = h * ratio;
    }
    //the bounds is represented by 2 corners expressed as latlong point so the order of coordinates is y first and x second
    return [[0, 0], [-h, w]];
  }

  /* Similar to the previous function but this one rely on photo width and height instead of ratio
  and allows to define specific margins. Margins can be useful to display for example a sketch which
  contains extra annotations outside the photo borders, while maintaining correct alignment */
  var getPhotoBoundsFromSize = function (imageSize, margins){
    let baseCanvasSize = 256;
    if (!margins){
      return getPhotoBoundsFromRatio(imageSize[0] / imageSize[1]);
    }
    var [imageWidth, imageHeight] = imageSize;
    var widthOfInterest = imageWidth - (margins['left'] + margins['right']);
    var heightOfInterest = imageHeight - (margins['top'] + margins['bottom']);
    var targetRatio = widthOfInterest / heightOfInterest;
    //compute scale factor (canvas units / pixel)
    if (targetRatio >= 1) {
        var scale = baseCanvasSize / widthOfInterest;
    } else {
        var scale = baseCanvasSize / heightOfInterest;
    }
    //Compute corners coordinates of the bound
    var left = -margins['left'] * scale;
    var top = margins['top'] * scale;
    var right = (widthOfInterest + margins['right']) * scale;
    var bottom = -(heightOfInterest + margins['bottom']) * scale;
    return [[top, left], [bottom, right]];
  }

  //test : compute sketch bounds without image size, possible only if margins are expressed as percentage
  var _getSketchBound = function (ratio, margins) {
    var margins = {'left':5.55, 'right':5.55, 'top':18.33, 'bottom':18.33}; //test with some percentages
    var wCanvas = 600;
    var hCanvas = 600 / ratio;
    for (let k in margins){
      //compute the canvas offset from percentage
      if (k == 'left' || k == 'right'){
        margins[k] = margins[k] * wCanvas / 100;
      } else {
        margins[k] = margins[k] * hCanvas / 100;
      }
    }
    var [[bottom, left], [top, right]] = getPhotoBoundsFromRatio(ratio);
    return [[bottom-margins['bottom'], left-margins['left']], [top+margins['top'], right+margins['right']]];
  }


  /* create a new image overlay for the sketch. Note that the sketch need to be perfectly aligned with
  the reference photo taking margins into account. Only L.imageOverlay offers the ability to
  precisely control the image bounds. That's why tileLayer is useless for this use case*/
  var getSketchLay = function(){
    let sketch = self.selectedFeatProps['SKETCH'];
    var margins = sketch['MARGINS'];
    margins = {'top':margins['TOP'], 'left':margins['LEFT'], 'right':margins['RIGHT'], 'bottom':margins['BOTTOM']};
    var size = [sketch['WIDTH'], sketch['HEIGHT']];
    var bounds = getPhotoBoundsFromSize(size, margins);
    //var bounds = _getSketchBound(self.selectedFeatProps['RATIO'], margins); // TEST
    var url = Mustache.render(self.activeProvider['sketch'], self.selectedFeatProps);
    var auteur = Mustache.render(self.activeProvider['photoAttrib'], sketch);
    var photoLay = L.imageOverlay(url, bounds, {className:'blendOverlay', zIndex:2, attribution:auteur});
    setLoadingEvents(photoLay);
    return photoLay;
  }

  /* create a new layer for the photo of the given date of the selected POV
  can be an image overlay or a tile layer, depending on the provider setting */
  var getPhotoLay = function(date){
    var photo = getPhoto(date);
    var url = getPhotoUrl(photo);
    var auteur = Mustache.render(self.activeProvider['photoAttrib'], photo);
    if (!self.activeProvider.tiled){
      var bounds = getPhotoBoundsFromRatio(self.selectedFeatProps['RATIO']);
      /*
      //Temporary set arbitrary bounds, the <img> element will be hidden until
      //the browser can't tell its real size (this happen before the image has been fully loaded)
      var bounds = getPhotoBoundsFromRatio(1.5);
      */
      var photoLay = L.imageOverlay(url, bounds, {attribution:auteur});
      setLoadingEvents(photoLay);
      return photoLay;
    } else {
      var photoLay = L.tileLayer.voppTiles(url, {
        width: photo['WIDTH'],
        height: photo['HEIGHT'],
        targetRatio: self.selectedFeatProps['RATIO'],
        continuousWorld: false,
        noWrap: true,
        attribution:auteur,
        tileSize:256,
        overlap:0
      });
      return photoLay;
    }
  }


  var setLoadingEvents = function (photoLayer){
    photoLayer
      .on('add', function(){
        /*
        //we can adjust the layer bounds as soon as the browser can reports the image size
        //but sometime the ratio change a little between photos of the same POV and that's break alignement
        //that's why it's better to rely on an unique ratio value for each photo of the POV
        var lay = this;
        var img = this.getElement();
        img.style.visibility = 'hidden';
        var poll = setInterval(function () {
          if (img.naturalWidth) {
            clearInterval(poll);
            lay.setBounds(getPhotoBoundsFromSize([img.naturalWidth, img.naturalHeight], margins));
            img.style.visibility = 'visible';
          }
        }, 10);
        */
        //spinner handle
        this.loaded = false;
        if ( !$('#photos>.spinner').length ) {
          spinner.spin(document.getElementById('photos'));
        }
      })
      .on('remove', function(){
        this.off('load');
      })
      .on('load', function(){
        this.loaded = true;
        if ( self.photoMap1.getLayers(L.imageOverlay).every( elem => elem.loaded)
          && self.photoMap2.getLayers(L.imageOverlay).every( elem => elem.loaded) ){
            spinner.stop();
        }
      });
  }


  var spinner = new Spinner({top: '95%', left: '5%'});

  /* Update photos containers according to the selected POV and dates */
  var updatePhotos = function (fit){
    _initUpdatePhotoCpt += 1;

    var feature = self.selectedFeat;
    if (!feature) {
      return;
    }

    if (fit == undefined) {
      fit = true;
    }

    //Clear layers
    self.photoMap1.clearLayers();
    self.photoMap2.clearLayers();
    spinner.stop();

    //Clear max zoom
    self.photoMap1.setMaxZoom();
    self.photoMap2.setMaxZoom();

    //clear custom controls
    if (sbsCtrl) {
      self.photoMap1.removeControl(sbsCtrl);
      sbsCtrl = false
    }
    if (magnifyingGlass) {
      self.photoMap1.removeControl(magnifyingGlass);
      magnifyingGlass = false
    }

    let hasActiveSketch1 = $('#sketchButton1').hasClass('active');
    let hasActiveSketch2 = $('#sketchButton2').hasClass('active');
    let hasBkgPhoto1 = $('#chkBkgPhoto1>input').prop('checked');
    let hasBkgPhoto2 = $('#chkBkgPhoto2>input').prop('checked');

    //Get overlay layers

    if (hasActiveSketch1) {
      var photoLay1 = getSketchLay();
    } else {
      var photoLay1 = getPhotoLay($('#dropDownDate1').val());
    }

    if (hasActiveSketch2) {
      var photoLay2 = getSketchLay();
    } else {
      var photoLay2 = getPhotoLay($('#dropDownDate2').val());
    }

    //###############
    //Add layers to maps

    if (self.viewMode == 'SINGLE'){
      photoLay1.addTo(self.photoMap1);
    }
    else if (self.viewMode == 'SPLIT'){
      photoLay1.addTo(self.photoMap1);
      photoLay2.addTo(self.photoMap2);
    }
    else if (self.viewMode == 'SBS'){
      photoLay1.options.pane = "left";
      photoLay2.options.pane = "right";
      photoLay1.addTo(self.photoMap1);
      photoLay2.addTo(self.photoMap1);
      sbsCtrl = L.control.sideBySide(photoLay1, photoLay2).addTo(self.photoMap1);
    }
    else if (self.viewMode == 'SPOT'){
      photoLay1.addTo(self.photoMap1);
      magnifyingGlass = L.magnifyingGlass({
        radius : 150,
        zoomOffset : 0,
        layers: [ photoLay2 ]
      }).addTo(self.photoMap1);
    }

    if (!self.activeProvider.tiled){
      self.photoMap1.setMaxZoom(self.phImageOverlayMaxZoom);
      if (self.viewMode == 'SPLIT'){
        self.photoMap2.setMaxZoom(self.phImageOverlayMaxZoom);
      }
    }

    if (self.theme.constrainMapExtent) {
      self.photoMap1.setMaxBounds(photoLay1.getBounds());
      if (self.viewMode == 'SPLIT'){
        self.photoMap2.setMaxBounds(photoLay2.getBounds());
      }
    }

    if (hasActiveSketch1 && hasBkgPhoto1){
      var refPhotoDate = self.selectedFeatProps['SKETCH']['PHOTOREF'];
      var bkgPhoto1 = getPhotoLay(refPhotoDate);
      if (self.viewMode == 'SBS'){
        bkgPhoto1.options.pane = "left";
      }
      bkgPhoto1.addTo(self.photoMap1).bringToBack();

    }
    if (hasActiveSketch2 && hasBkgPhoto2){
      var refPhotoDate = self.selectedFeatProps['SKETCH']['PHOTOREF'];
      var bkgPhoto2 = getPhotoLay(refPhotoDate);
      bkgPhoto2.options.pane = "overlayPane";
      if (self.viewMode == 'SPOT'){
        magnifyingGlass.getMap().addLayer(bkgPhoto2);
        bkgPhoto2.bringToBack();
      } else if (self.viewMode == 'SBS'){
        bkgPhoto2.options.pane = "right";
        bkgPhoto2.addTo(self.photoMap1).bringToBack();
      } else {
        bkgPhoto2.addTo(self.photoMap2).bringToBack();
      }
    }

    //Force displaying photomap2 attribution(s) in SPOT mode
    if (self.viewMode == 'SPOT'){
      magnifyingGlass.getMap().eachLayer( function(lay) {
        self.photoMap1.attributionControl.addAttribution(lay.getAttribution());
        lay.on('remove', function(){
          self.photoMap1.attributionControl.removeAttribution(lay.getAttribution());
        });
      });
    }

    //Checks if the map container size changed and updates the map if so
    //we need to invalidate size before any fit bounds
    self.photoMap1.invalidateSize()
    self.photoMap2.invalidateSize()

    if (fit) {
      self.photoMap1.fitBounds(photoLay1.getBounds());
      //photoMa2 is synchronized...
    }

  }


  /* ########################################
  url handlers
  ######################################## */

  /* Generate an url with parameters matching the current app state
  Url availale parameters : &theme, &provider, &pov, &date1, &date2, &viewmode */
  var generateUrl = function(includeDates, includeViewMode){
    let params = '?';
    if (!self.theme.default){
      params += `theme=${self.theme.key}&`;
    }
    params += `provider=${self.activeProvider.key}&pov=${self.selectedFeatProps.NUM}`;
    if (includeDates){
      params += `&date1=${$('#dropDownDate1').val()}&date2=${$('#dropDownDate2').val()}`;
    }
    if (includeViewMode){
      params += `&viewmode=${self.viewMode}`;
    }
    var url = window.location.protocol + "//" + window.location.host + window.location.pathname;
    return url + params;
  }

  /* Update current url parameters and, if needed, push it into the browser history stack */
  var updateUrl = function(doNotRegister) {
    if (!registerHistory && hideParams){
      //cleanup parameters if needed
      if (window.location.href.includes('?')) {
        let url = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState(null, null, url);
      }
      return;
    }
    let url = generateUrl(registerDates, registerViewMode);
    if (registerHistory && !doNotRegister){
      window.history.pushState(null, null, url);
    } else {
      window.history.replaceState(null, null, url);
    }
  }



  /* ########################################
  Dates dropDown handlers
  ######################################## */

  /* Disable dropdowns change event */
  var dropDownDateOff = function () {
    $('.dropDownDate').off();
  }

  /* Enable dropdowns change event */
  var dropDownDateOn = function () {
    $('.dropDownDate').on('change', function() {
      updatePhotos(false);
      synchTimeline();
      if (registerDates) {
        updateUrl();
      }
    });
  }

  var synchTimeline = function () {
    $('.photoThumb.active').toggleClass('active');
    $('.thumbMark1, .thumbMark2').remove();
    let d1 = $('#dropDownDate1').val();
    let d2 = $('#dropDownDate2').val();
    $(`#${d1}.photoThumb`)
    .toggleClass('active')
    .append(
      $("<div class='thumbMark1'></div>").text("1")
    );
    if (self.viewMode != 'SINGLE') {
      thumb2 = $(`#${d2}.photoThumb`);
      if (d1 != d2) {
        thumb2.toggleClass('active');
      }
      thumb2.append(
        $("<div class='thumbMark2'></div>").text("2")
      );
    }

  }

  /* Select a dropdown entry given a target date */
  var dropDownDateSelect = function(id, targetDate){
    if (hasDate(id, targetDate)){
      $(id).val(targetDate).change();
    } else {
      let photo = getPhoto(targetDate);
      if (photo) {
        $(id).val(getDateKey(photo)).change();
      }
    }
  }

  /* Increase current dropdown index and update the photo */
  var dropDownDateNext = function(id){
    /* @param id : the DOM element selector */
    let i = $(id).prop('selectedIndex');
    let n = $(id + ' option').length;
    if (i+1 < n){
      $(id).prop('selectedIndex', i+1).change();
    }
  }

  /* decrease current dropdown index and update the photo */
  var dropDownDatePrev = function(id){
    /* @param id : the DOM element selector */
    let i = $(id).prop('selectedIndex');
    if (i > 0){
      $(id).prop('selectedIndex', i-1).change();
    }
  }

  /* check if a given dropdown has a given date */
  var hasDate = function (id, date){
    /* @param id : the DOM element selector
      @param date : the searched date value */
    let exists = false;
    $(id+' option').each(function(){
      if (this.value == date) {
        exists = true;
      }
    });
    return exists;
  }


  /* ########################################
  clusters handlers
  ######################################## */

  /* Switch cluster map layer visibility */
  var toggleClusterLayer = function(provId){
    /* @param provId : provider key of the target cluster layer */
    let lay = self.markersClusters[provId];
    if (self.map.hasLayer(lay)){
      disableClusterLayer(provId);
    } else {
      enableClusterLayer(provId);
    }
  }

  /* Hide cluster layer from the map */
  var disableClusterLayer = function(provId){
    let lay = self.markersClusters[provId];
    self.map.removeLayer(lay);
    $('.clusterLegendContainer #' + provId).text('X').css('background', 'rgba(60,60,60,0.25)');
  }

  /* Show a cluster layer into the map */
  var enableClusterLayer = function(provId){
    /* @param provId : provider key of the target cluster layer */
    let lay = self.markersClusters[provId];
    self.map.addLayer(lay);
    let p = getProvider(provId);
    $('.clusterLegendContainer #' + provId).text(p.shortName).css('background', p.clusterColor);
  }


  /* ########################################
  search handlers
  ######################################## */


  var search = function(){

    //First filter data with the query string
    var data = [];
    let qry = $('#query').val();
    if (qry) {
      self.providers.forEach(prov => {
        data.push(...self.fuses[prov.key].search(qry));
      });
    } else {
      var data = self.oppData;
    }


    //Then apply all dropdown filters
    $('.dropDownFilter').each(function (idx, elem) {
      elem = $(elem);
      if (elem.val()) {
        data = data.filter(pov => {
          if (Array.isArray(pov[elem.attr('id')])){
            return pov[elem.attr('id')].includes(elem.val());
          } else {
            return pov[elem.attr('id')] == elem.val();
          }
        });
      }
    });

    //Process result
    showSearchResults(data);
  }

  /* fill the result list view and rebuild the clusters by filtering markers
   according to the search result */
  var showSearchResults = function(r){
    $('#results').empty();
    r.forEach(function(pov){
      let prov = getProvider(pov.PROVIDER);

      $('#results').append(
        $('<li>')
          .attr('id', `${pov.PROVIDER}__${pov.NUM}`)
          .css('color', prov.clusterColor)
          .append(
            prov.searchResultsTemplate.map( (line, i) => {
              return $('<div>').append(Mustache.render(line, pov)).addClass(`line${i+1}`)//
            })
          )
        /*
        $(`<tr id=${pov.PROVIDER}__${pov.NUM} style="color:${getProvider(pov.PROVIDER).clusterColor}"">
            <td>${pov.NOM}</td>
            <td>${pov.COMMUNE}</td>
            <td>${yearMin} > ${yearMax}</td>
          </tr>`)*/
      );
    });
    //spatial filter
    for (let provId in self.markersClusters){
      let povIds = r.map(elem => {
        if (elem.PROVIDER == provId) {return elem.NUM;}
      });
      let cluster = self.markersClusters[provId];
      cluster.clearLayers();
      let layGroup = self.oppLayers[provId];
      let markers = layGroup.getLayers().filter(elem => povIds.includes(elem.feature.properties.NUM));
      cluster.addLayers(markers);
      self.isFiltered = true;
      $('#toggleSearchBt').addClass('activeFilter');
      $('#clearSearchBt').show();
    }
  }

  /* Select a new POV by clicking on a search result entry */
  var selectFromSearchList = function(searchId){
    var [provId, povId] = searchId.split('__');
    $('#results>.selected').toggleClass("selected");//unselect
    $('#results>#' + searchId).toggleClass("selected");
    self.selectedMark = getMarker(provId, povId);
    self.map.flyTo(self.selectedMark.getLatLng(), 15);
    updateYears();
    updatePhotos();
    updateUrl();
    toggleInfosPanel();
  }

  /* Clear the result list and the spatial filter */
  var clearSearch = function() {
    $('#query').val('');
    $('#results').empty();
    $('#PROVIDER').prop('selectedIndex', 0);
    $('.customFilter').remove();
    for (let key in self.markersClusters){
      let cluster = self.markersClusters[key];
      cluster.clearLayers();
      cluster.addLayers(self.oppLayers[key].getLayers());
    }
    self.isFiltered = false;
    $('#toggleSearchBt').removeClass('activeFilter');
    $('#clearSearchBt').hide();
  }


  /*Create and fill provider's custom filters */
  var updateCustomFilters = function() {
    $('.customFilter').remove();
    var selectedProvider = getProvider($('#PROVIDER').val());
    if (!selectedProvider){return};
    for (let filter in selectedProvider.filters) {
      let label = selectedProvider.filters[filter];
      $('#filters').append(
        $("<div>").addClass('searchFilter customFilter').append(
          $('<div>').addClass('label').html(`${label} : `),
          $('<select>').addClass('dropDownFilter').attr('id', filter)
          .append($('<option></option>').val(''))
        )
      );
      var uniqueValues = [];
      self.oppData.filter(pov => pov['PROVIDER'] == selectedProvider.key).forEach(pov => {
        v = pov[filter];
        if (!v) {return}; //skip blank values
        if (Array.isArray(v)){
          uniqueValues.push(...v); //extend
        } else {
          uniqueValues.push(v);
        }
      });
      uniqueValues = Array.from(new Set(uniqueValues));
      uniqueValues.sort();
      uniqueValues.forEach(value => {
        $('#'+filter).append(
          $('<option></option>')
          .val(value)
          .html(value)
        );
      });
    }
  }

  /* Deprecated
  Synch provider dropdown filter with map cluster legend */
  var updateProviderFilter = function() {
    self.providers.forEach(p => {
      if (p.key != $('#providerFilter').val()){
        let lay = self.markersClusters[p.key];
        if (self.map.hasLayer(lay)){
          disableClusterLayer(p.key);
        }
      } else {
        enableClusterLayer(p.key);
      }
    });
  }

  /* ########################################

                DOM methods

  ######################################## */

  var connectEvents = function (){
    /* Map controls */
    $('.clusterLegend').on('click', function(){
      toggleClusterLayer($(this).attr('id'));
    });
    $('.zoomToExtentBt').on('click', function(){
      self.map.flyToBounds(self.extent);
    });
    /* View modes */
    $('#toggleSplitViewBt').on('click', function(){
      toggleSplitView();
    });
    $('#toggleSbsViewBt').on('click', function(){
      toggleSbsView();
    });
    $('#toggleSpotViewBt').on('click', function(){
      toggleSpotView();
    });
    $('.viewMode').on('click', function () {
      if (registerViewMode) {
        updateUrl();
      }
    });
    /* Panels */
    $("#toggleInfosBt").on('click', function () {
      toggleInfosPanel();
    });
    $("#toggleSearchBt").on('click', function () {
      toggleSearchPanel();
    });
    $("#aboutBt").on('click', function () {
      toggleAboutPanel();
    });
    /* Misc tools */
    $("#shareBt").on('click', function () {
      shareUrl();
    }).on('click', 'div', function(e) {
      // clicked on descendant div
      e.stopPropagation();
    });
    /* Widgets */
    $("#sketchButton1").on('click', function () {
      toggleSketchView(1);
    });
    $("#sketchButton2").on('click', function () {
      toggleSketchView(2);
    });
    $('#photoNext1').on('click', function () {
      dropDownDateNext('#dropDownDate1');
    });
    $('#photoNext2').on('click', function () {
      dropDownDateNext('#dropDownDate2');
    });
    $('#photoPrev1').on('click', function () {
      dropDownDatePrev('#dropDownDate1');
    });
    $('#photoPrev2').on('click', function () {
      dropDownDatePrev('#dropDownDate2');
    });
    $('.chkBkgPhoto>input').on('change', function() {
      updatePhotos(false);
    });
    /* search */
    let keyUpTimeout;
    $('#query').on('keyup', function() {
      clearTimeout(keyUpTimeout);
      keyUpTimeout = setTimeout(function () {
          search();
      }, 500);
    });
    $("#clearSearchBt").on('click', function () {
      clearSearch();
    });
    $('#results').on('click', 'li, tr', function(){
      selectFromSearchList($(this).attr('id'));
    });
    $('#PROVIDER').on('change', function() {
      updateCustomFilters();
    });
    $('#filters').on('change', '.dropDownFilter', function() {
      search();
    });
    /*Timeline*/
    $("#toggleTimelineBt").on('click', function () {
      toggleTimeline();
    });
    $("#timeline").on('click', '.photoThumb', function () {
      if (self.viewMode == 'SINGLE'){
        thumbSelect($(this).attr('id'));
      } else {
        $(this).addClass('activeLink');
        $(this).children('.thumbLink').addClass('activeLink');
      }
    });
    $("#timeline").on('mouseleave', '.photoThumb', function () {
      $(this).removeClass('activeLink');
      $(this).children('.thumbLink').removeClass('activeLink');
    });
    $("#timeline").on('click', '.thumbLink', function (e) {
      thumbSelect($(this).parent().attr('id'), $(this).attr('id'));
      $(this).parent().removeClass('activeLink');
      $('.thumbLink').removeClass('activeLink');
      e.stopPropagation();
    });
    $("#thumbNext").click(function(){
      //$("#thumbs").scrollLeft($("#thumbs").scrollLeft() + 500);
      $("#thumbs").animate( {scrollLeft : $("#thumbs").scrollLeft() + 500} );
    });
    $("#thumbPrev").click(function(){
      $("#thumbs").animate( {scrollLeft : $("#thumbs").scrollLeft() - 500} );
    });
  }

  var shareUrl = function (e) {
    $('.sharePanel, #shareBt').toggleClass('active');
    let url = generateUrl(registerDates, registerViewMode);
    $('#urlTxt').html(url);
  }

  /* ########################################
  view modes switch
  ######################################## */

  var toggleSingleView = function () {
    self.viewMode = 'SINGLE';
    $('.toolbarBt.viewMode.active').removeClass('active');
    $('#photo1').css('height', '100%');
    $('#photo2').css('display', 'none');
    $('#widgets2').hide();
    self.north.setPosition('topright'); //because setPosition remove and then recreate the div...
    setAzimuth(); //...we need to recompute the angle
    updatePhotos();
    synchTimeline();
  }

  var toggleSplitView = function () {
    if (self.viewMode == 'SPLIT'){
        toggleSingleView();
    } else {
      self.viewMode = 'SPLIT';
      $('.toolbarBt.viewMode.active').removeClass('active');
      $('#toggleSplitViewBt').addClass('active');
      $('#photo1').css('height', '50%');
      $('#photo2').css('display', 'block');
      $('#widgets2').show();
      $("#widgets2").removeClass('topRight').addClass('middleLeft');
      $('#sketchButton2').detach().insertAfter('#dropDownDate2');
      $('#widgets2>*').removeClass('alignRight');
    }
    updatePhotos();
    synchTimeline();
  }

  var toggleSbsView = function () {
    if (self.viewMode == 'SBS'){
      toggleSingleView();
    } else {
      self.viewMode = 'SBS';
      $('.toolbarBt.viewMode.active').removeClass('active');
      $('#toggleSbsViewBt').addClass('active');
      $('#photo1').css('height', '100%');
      $('#photo2').css('display', 'none');
      $('#widgets2').show();
      $("#widgets2").removeClass('middleLeft').addClass('topRight');
      $('#sketchButton2').detach().insertBefore('#dropDownDate2');
      $('#widgets2>*').addClass('alignRight');
      self.north.setPosition('bottomright');
      setAzimuth();
    }
    updatePhotos();
    synchTimeline();
  }

  var toggleSpotView = function () {
    if (self.viewMode == 'SPOT'){
      toggleSingleView();
    } else {
      self.viewMode = 'SPOT';
      $('.toolbarBt.viewMode.active').removeClass('active');
      $('#toggleSpotViewBt').addClass('active');
      $('#photo1').css('height', '100%');
      $('#photo2').css('display', 'none');
      $('#widgets2').show();
      $("#widgets2").removeClass('middleLeft').addClass('topRight');
      $('#sketchButton2').detach().insertBefore('#dropDownDate2');
      $('#widgets2>*').addClass('alignRight');
      self.north.setPosition('bottomright');
      setAzimuth();
    }
    updatePhotos();
    synchTimeline();
  }

  var toggleTimeline = function () {
    $('#toggleTimelineBt, #timeline').toggleClass('active');
    self.photoMap1.invalidateSize();
    self.photoMap2.invalidateSize();

  }

  /* ########################################
  panels switch
  ######################################## */

  var toggleInfosPanel = function () {
    if ($("#sidePanel").hasClass('active') && ($(".toolbarBt.panelSwitch.active").prop('id') != "toggleInfosBt")){
      $("#sidePanel, .panel.active:not(#infosPanel), .toolbarBt.panelSwitch.active:not(#toggleInfosBt)").toggleClass('active');
    }
    $("#sidePanel, #infosPanel, #toggleInfosBt").toggleClass('active');
    self.photoMap1.invalidateSize();
    self.photoMap2.invalidateSize();
  }

  var toggleSearchPanel = function(){
    if ($("#sidePanel").hasClass('active') && ($(".toolbarBt.panelSwitch.active").prop('id') != "toggleSearchBt")){
      $("#sidePanel, .panel.active:not(#searchPanel), .toolbarBt.panelSwitch.active:not(#toggleSearchBt)").toggleClass('active');
    }
    $("#sidePanel, #searchPanel, #toggleSearchBt").toggleClass('active');
    self.photoMap1.invalidateSize();
    self.photoMap2.invalidateSize();
  }

  var toggleAboutPanel = function(){
    if ($("#sidePanel").hasClass('active') && ($(".toolbarBt.panelSwitch.active").prop('id') != "aboutBt")){
      $("#sidePanel, .panel.active:not(#aboutPanel), .toolbarBt.panelSwitch.active:not(#aboutBt)").toggleClass('active');
    }
    $("#sidePanel, #aboutPanel, #aboutBt").toggleClass('active');
    self.photoMap1.invalidateSize();
    self.photoMap2.invalidateSize();
  }


  /* ########################################
  sketch toggle
  ######################################## */

  /* Show or hide the sketch button according to
  sketches availability for the current provider */
  var setupSketchButton = function(){
    if (self.activeProvider['sketch']){
      $('.sketchButton').show();
    } else {
      $('.sketchButton').removeClass('active');
      $('.sketchButton').hide();
      $('.chkBkgPhoto').hide();
      $('.dropDownDate').prop('disabled', false);
      $('.photoNav').show();
    }
  }


  /* Show the sketch in place of the corresponding photo container */
  var toggleSketchView = function (id) {
    $("#sketchButton"+id).toggleClass('active');
    if ($('#sketchButton'+id).hasClass('active')){
      $("#chkBkgPhoto"+id).show();
      $('#dropDownDate'+id).prop('disabled', true);
      $('#photoNav'+id).hide();
    } else {
      $("#chkBkgPhoto"+id).hide();
      $('#dropDownDate'+id).prop('disabled', false);
      $('#photoNav'+id).show();
    }
    updatePhotos();
  }


  /* ########################################
  Start init sequence once all functions have been declared
  ######################################## */

  init();

};


/* ########################################
Main
######################################## */

var opp; //global scope
var version = 102;
var baseurl = document.getElementById("oppjs").getAttribute('src').split('/').slice(0, -1).join('/');
if (baseurl.length == 0) {
  baseurl = ".";
}

if (typeof themeJsonUrl == 'undefined') {
  var themeJsonUrl = baseurl + '/themes.json?v=' + version;
}

//make sure json MIME type exists because it sould be provided when loading local file
$.ajaxSetup({beforeSend: function(xhr){
  if (xhr.overrideMimeType)
  {
    xhr.overrideMimeType("application/json");
  }
}
});


$(document).ready(function() {

  //fix white lines gap https://github.com/Leaflet/Leaflet/issues/3575
  var originalInitTile = L.GridLayer.prototype._initTile;
  L.GridLayer.include({
    _initTile: function (tile) {
      originalInitTile.call(this, tile);
      var tileSize = this.getTileSize();
      tile.style.width = tileSize.x + 1 + 'px';
      tile.style.height = tileSize.y + 1 + 'px';
    }
  });

  //Search if the target theme is identified in the url
  let params = new URL(window.location).searchParams;
  let themeKey = params.get('theme');
  if (!themeKey){
    //maybe the theme is declared through an url alias
    let url = window.location.pathname;
    url = url.endsWith('/') ? url.slice(0, -1) : url;
    themeKey = url.split("/").pop();
  }

  loading = new Spinner({
    top: '50%', left: '50%',
    animation: 'spinner-line-shrink',
    radius:20,
    scale: 2,
    length: 0
  }).spin(document.getElementById('container'));

  var providers, settings;
  $.when(
    $.getJSON(`${baseurl}/providers.json?v=${version}`, function (data) {
      providers = data;
    }),
    //$.getJSON(`${baseurl}/themes.json?v=${version}`, function (data) {
    $.getJSON(`${themeJsonUrl}`, function (data) {
      if (themeKey){
        settings = data.find(theme => theme.key == themeKey);
      }
      if (!themeKey || !settings){
        //test if this url domain is associated to a specific theme
        settings = data.filter(theme => "domains" in theme).find(theme => {
          return theme.domains.some(domain => domain == window.location.hostname);
        });
        //if not return the default theme
        if (!settings){
          settings = data.find(theme => Boolean(theme.default));
        }
      }
    })
  ).then(function(){
    opp = new OPP(providers, settings);
    opp.loading.then(function(){
      loading.stop();
      $('#loading').fadeOut(1000);
    });
  });

  //history back/forward buttons
  $(window).bind('popstate', function(event) {
    opp.refresh();
  });

});
