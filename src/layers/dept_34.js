
opp.bkgLayers['dept_34'] = {

  title : "Département de l'Hérault",

  enable : true,

  load : function(data) {

      this.layer = L.geoJson(data, {
          style: function (feature) {
            return {stroke:true, color:"#999", weight:2, fill:false, fillColor:"#eee", fillOpacity:0.2};
          }
      });
  }

}
