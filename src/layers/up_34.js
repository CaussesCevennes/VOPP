
opp.bkgLayers['up_34'] = {

  title : "Unités paysagères",

  enable : true,

  load : function(data){

      /*
      param data : fetched geojson object
      prop layer : leaflet L.geoJson object
      [prop info] : leaflet custom control displaying top left label on mouse over
      [prop legend] : leaflet custom control displaying the bottom left lendend
      */

      var self = this;

      //by default paths like polylines/polygons have a zidx of 400, markers of 600 and tilelayers of 200
      //here downgrade the index to make sure this layer will be displayed back to others custom geojson layers
      opp.map.createPane('up');
      opp.map.getPane('up').style.zIndex = 300;

      self.info = L.control({position: 'topleft'});
      self.info.onAdd = function (map) { //should return the container DOM element for the control
          this._div = L.DomUtil.create('div', 'info'); //'info' is the css class name
          return this._div;
      };
      self.info.update = function (props) {
          if (props){
              $('.info').css('display', 'inline-block')
              this._div.innerHTML = props.nom;
          } else {
              this._div.innerHTML = '';
              $('.info').css('display', 'none')
          }
      };

      //prepare some random colors for our features
      let randomColor = function (){
        return '#'+ ('000000' + Math.floor(Math.random()*16777215).toString(16)).slice(-6); // 16777215 == ffffff in decimal
      }
      var colors = {};
      data.features.forEach(function(feat){
        colors[feat.properties.nom] = randomColor();
      });

      self.layer = L.geoJson(data, {
          style: function (feature) {
              return {
                stroke:true, color:"white", weight:1, dashArray:"4, 4",
                fill:true, fillColor:colors[feature.properties.nom], fillOpacity:0.25
              };
          },
          onEachFeature: function (feature, layer) {
              layer.on('mouseover', function (e){
                  layer.setStyle({weight:3, fillOpacity:0.5});
                  self.info.update(layer.feature.properties);
              });
              layer.on('mouseout', function (e){
                  self.layer.resetStyle(e.target);
                  self.info.update();
              });
          },
          pane: 'up'
      });

      /*
      self.legend = L.control({position: 'bottomright'});
      self.legend.onAdd = function (map) {
          var div = L.DomUtil.create('div', 'legend'); //'legend' is the target css classe
          self.layer.eachLayer(function(lay){
            let props = lay.feature.properties;
            div.innerHTML += `<p><span class="icon" style="background:${lay.options.fillColor};"></span>${props.nom}</p>`;
          });
          return div;
      };
      */
  }

}
