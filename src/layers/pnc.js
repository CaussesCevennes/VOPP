
opp.bkgLayers['pnc'] = {

  title : 'Parc National des Cévennes',

  enable : true,

  load : function(data){

      this.layer = L.geoJson(data, {
          style: function (feature) {
            return {stroke:true, color:"white", weight:1, dashArray:"4, 4", fill:true, fillColor:"green", fillOpacity:0.5};
          }
      });

      this.legend = L.control({position: 'bottomright'});
      this.legend.onAdd = function (map) {
          var div = L.DomUtil.create('div', 'legend');
          div.innerHTML += '<p><span class="icon" style="border:1px dashed white; background-color:green;"></span>Parc National des Cévennes</p>';
          return div;
      };

  }

}
