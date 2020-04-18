
L.TileLayer.VOPPTiles = L.TileLayer.extend({
  options: {
    width: undefined,
    height: undefined,
    targetRatio: undefined, //may differ from width/height, it's a property of the POV
    tileSize : 256,
    overlap : 0
  },

  initialize: function (url, options) {
    var options = L.setOptions(this, options);
    this._url = url;

    //compute and assign the max native zoom
    var maxSize = Math.max(this.options.width, this.options.height);
    this.options.maxNativeZoom  = Math.ceil(Math.log2(maxSize / this.options.tileSize));
    //make sure we can zoom a little futher
    this.options.maxZoom = this.options.maxNativeZoom + 2;

    //with simple CRS, one pixel = one unit. So at zoom 0, one tile of 256px represents 256 units
    var baseCanvasSize = this.options.tileSize;
    var ratio = this.options.targetRatio
    if (ratio >= 1){ //witdh larger than height (or just square)
      var w = baseCanvasSize;
      var h = w / ratio;
    } else {
      var h = baseCanvasSize;
      var w = h * ratio;
    }

    //set bounds (for a tilelayer, bounds define the area of available tiles and allows to inhib requests outside the box)
    var bounds = [[0, 0], [-h, w]];
    this.options.bounds = new L.LatLngBounds(bounds);

  },

  //Define an accessor to the bounds property, same method name as imageOverlay
  getBounds: function () {
    return this.options.bounds;

  },

  // Extend the add tile function to update our arbitrary sized border tiles
  _addTile: function (coords, container) {
    //call original function
    L.TileLayer.prototype._addTile.call(this, coords, container);
    // Adjust sizes to handle non 256x256 tiles
    var expectedSize = this.options.tileSize + this.options.overlap;
    this.on('tileload', function(tile, url) {
      // get tile size from DOM image element properties
      var height = tile.tile.naturalHeight,
          width = tile.tile.naturalWidth;
      // update css style if needed
      if (height != expectedSize){
        tile.tile.style.height = height + 'px';
      } else if (width != expectedSize) {
        tile.tile.style.width = width + 'px';
      }
    });
  },

});

L.tileLayer.voppTiles = function (url, options) {
  return new L.TileLayer.VOPPTiles(url, options);
};
