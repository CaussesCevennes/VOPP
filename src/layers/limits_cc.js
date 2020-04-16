
opp.bkgLayers['limits_cc'] = {

  title : 'Zonage UNESCO',

  enable : true,

  load : function(data){

      this.layer = L.geoJson(data, {
          style: function (feature) {
              switch (feature.properties.type) {
                  case 'Zone inscrite': return {color: "red", dashArray:"5, 10", opacity:0.5};
                  case 'Zone tampon': return {color: "black", dashArray:"5, 10", opacity:0.5};
              }
          }
      });

      this.legend = L.control({position: 'bottomright'});
      this.legend.onAdd = function (map) {
          var div = L.DomUtil.create('div', 'legend');
          div.innerHTML += '<p><span class="icon" style="border:2px dashed black; background:transparent;"></span>Zone inscrite</p>';
          div.innerHTML += '<p><span class="icon" style="border:2px dashed red; background:transparent;"></span>Zone tampon</p>';
          return div;
      };

  }

}
