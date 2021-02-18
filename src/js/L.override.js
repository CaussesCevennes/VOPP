//fix white lines gap https://github.com/Leaflet/Leaflet/issues/3575
/*
var originalInitTile = L.GridLayer.prototype._initTile;
L.GridLayer.include({
  _initTile: function (tile) {
    originalInitTile.call(this, tile);
    var tileSize = this.getTileSize();
    tile.style.width = tileSize.x + 1 + 'px';
    tile.style.height = tileSize.y + 1 + 'px';
  }
});
*/

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
