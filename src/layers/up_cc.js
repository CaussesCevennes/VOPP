
opp.bkgLayers['up_cc'] = {

  title : "Unités paysagères",
  enable : true,
  maxZoom : 11,

  load : function(data){

      var self = this;

      //by default paths like polylines/polygons have a zidx of 400, markers of 600 and tilelayers of 200
      //here downgrade the index to make sure this layer will be displayed back to others custom geojson layers
      opp.map.createPane('up');
      opp.map.getPane('up').style.zIndex = 300;

      this.info = L.control({position: 'topleft'});
      this.info.onAdd = function (map) { //should return the container DOM element for the control
          this._div = L.DomUtil.create('div', 'info'); //'info' is the css class name
          return this._div;
      };
      this.info.update = function (props) {
          if (props){
              $('.info').css('display', 'inline-block')
              this._div.innerHTML = props.UP2;
          } else {
              this._div.innerHTML = '';
              $('.info').css('display', 'none')
          }
      };

      let UPColors = {
          'Causses': "darkorange",
          'Cévennes': "darkgreen",
          'Monts': "darkred",
          'Gorges': "dodgerblue",
          'Vallées interieures': "mediumseagreen",
          'Avant-causses': "black",//"gold",
          'Avant-monts': "black",//"salmon",
          'Hauts plateaux': "darkorange",
          'Vallée du Lot': "black",//"skyblue",
          'Autres': "black"
      };

      this.layer = L.geoJson(data, {
          style: function (feature) {
              return {
                stroke:true, color:"white", weight:1, dashArray:"4, 4",
                fill:true, fillColor:UPColors[feature.properties.UP1], fillOpacity:0.5
              };
          },
          onEachFeature: function (feature, layer) {
              layer.on('mouseover', function (e){
                  layer.setStyle({weight:3, fillOpacity:0.7});
                  self.info.update(layer.feature.properties);
              });
              layer.on('mouseout', function (e){
                  self.layer.resetStyle(e.target);
                  self.info.update();
              });
          },
          pane: 'up'
      });

      this.legend = L.control({position: 'bottomright'});
      var incLeg = ['Causses', 'Cévennes', 'Monts', 'Gorges', 'Vallées interieures'];
      this.legend.onAdd = function (map) {
          var div = L.DomUtil.create('div', 'legend'); //'legend' is the target css class
          for (cat in UPColors) {
              if (incLeg.includes(cat)) {
                  div.innerHTML += `<p><span class="icon" style="background:${UPColors[cat]};"></span>${cat}</p>`;
              }
          }
          return div;
      };
  }

}
