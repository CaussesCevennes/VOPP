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

/*
var setTransform = function(el, pos, scale, matrix){
   el._leaflet_pos = pos;

   if (matrix){
     var cssMatrixStr = ' matrix('
       + [matrix[0][0], matrix[1][0], matrix[0][1], matrix[1][1], matrix[0][2], matrix[1][2]]
       .join(', ')
       + ')';
   }

   if (L.Browser.any3d) {
     var scale;
     el.style[L.DomUtil.TRANSFORM] =
       (L.Browser.ie3d ?
         'translate(' + pos.x + 'px,' + pos.y + 'px)' :
         'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
         (scale ? ' scale(' + scale + ')' : '') +
         (matrix ? cssMatrixStr : '');

   } else {
     el.style.left = pos.x + 'px';
     el.style.top = pos.y + 'px';
   }
 };
*/

 L.ImageOverlay.include({
   _animateZoom: function (e) {
     var scale = this._map.getZoomScale(e.zoom),
         offset = this._map._latLngBoundsToNewLayerBounds(this._bounds, e.zoom, e.center).min,
         el = this._image;

     var matrix;
     if (this.photo){
       var [sx, rx, tx] = this.photo.matrix[0];
       var [ry, sy, ty] = this.photo.matrix[1];
       tx = tx * parseInt(el.style.width) / this.photo.WIDTH;
       ty = ty * parseInt(el.style.height) / this.photo.HEIGHT;
       matrix = 'matrix(' + [sx, ry, rx, sy, tx, ty].join(', ') + ')';
     }

     var pos = offset || new Point(0, 0);
     el.style[L.DomUtil.TRANSFORM] =
       (L.Browser.ie3d ?
         'translate(' + pos.x + 'px,' + pos.y + 'px)' :
         'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
         (scale ? ' scale(' + scale + ')' : '') +
         (matrix ? matrix : '');
   }
 });

 L.ImageOverlay.include({
   _reset: function () {
     var el = this._image;
     var bounds = new L.Bounds(
         this._map.latLngToLayerPoint(this._bounds.getNorthWest()),
         this._map.latLngToLayerPoint(this._bounds.getSouthEast()));

     var size = bounds.getSize();
     var pos = bounds.min; //=offset

     el.style.width  = size.x + 'px';
     el.style.height = size.y + 'px';

     el._leaflet_pos = pos; //Mainly for the purposes of L.Draggable.

     var matrix;
     if (this.photo){
       var [sx, rx, tx] = this.photo.matrix[0];
       var [ry, sy, ty] = this.photo.matrix[1];
       tx = tx * parseInt(el.style.width) / this.photo.WIDTH;
       ty = ty * parseInt(el.style.height) / this.photo.HEIGHT;
       matrix = 'matrix(' + [sx, ry, rx, sy, tx, ty].join(', ') + ')';
     }

     if (L.Browser.any3d) {
       var scale;
       el.style[L.DomUtil.TRANSFORM] =
         (L.Browser.ie3d ?
           'translate(' + pos.x + 'px,' + pos.y + 'px)' :
           'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
           (scale ? ' scale(' + scale + ')' : '') +
           (matrix ? matrix : '');

     } else {
       el.style.left = point.x + 'px';
       el.style.top = point.y + 'px';
     }
   }
 });


 L.GridLayer.include({


   _addTile: function (coords, container) {

     //coords in the tile number in the tiles matrix

     //tilepos is the coords in px of the topleft corner of the tile
     var tilePos = this._getTilePos(coords); //coords.scaleBy(this.getTileSize()).subtract(this._level.origin);
     //console.log(this._level.origin);

     //key is the tile number in the tiles matrix represented as x:y:z string
     var key = this._tileCoordsToKey(coords);

     var tile = this.createTile(this._wrapCoords(coords), L.Util.bind(this._tileReady, this, coords));


     this._initTile(tile);

     // if createTile is defined with a second argument ("done" callback),
     // we know that tile is async and will be ready later; otherwise
     if (this.createTile.length < 2) {
       // mark tile as ready, but delay one frame for opacity animation to happen
       L.Util.requestAnimFrame(L.Util.bind(this._tileReady, this, coords, null, tile));
     }

     //########################
     //L.DomUtil.setPosition(tile, tilePos); //we need to override this function
     var el = tile;
     el.style['transform-origin'] = '0 0'; //important !

     var matrix; //css matrix
     if (this.photo && this.matrix){

       //adjust matrix
       var tileMatrixSize = this.getTileSize().x * Math.pow(2, this._level.zoom);
       //var tileMatrixSize = parseInt(el.style.width) * Math.pow(2, this._level.zoom);
       //console.log(this._map.getZoom()); //warning seems the map zoom level property is not already updated at this stade
       var ratio = 1.5;

       //console.log(this.getTileSize().x, parseInt(el.style.width)); //(256, 257)

       //var imgw = parseInt(el.style.width);
       //var imgh = parseInt(el.style.height);
       var imgw = tileMatrixSize;
       var imgh = Math.ceil(tileMatrixSize / ratio);
       //imgh = Math.ceil(imgh/256)*256; //round to upper multiple of tilesize

       //console.log(imgw, imgh);

       var [sx, rx, tx] = this.matrix[0];
       var [ry, sy, ty] = this.matrix[1];
       tx = tx * imgw / this.photo.WIDTH;
       ty = ty * imgh / this.photo.HEIGHT;
       matrix = 'matrix(' + [sx, ry, rx, sy, 0, 0].join(', ') + ')';

       //project tilepos
       var tilePos = coords.scaleBy(this.getTileSize());
       px = sx * tilePos.x + rx * tilePos.y + tx; //warn do not update tilePos.x before compute tilePos.y
       py = ry * tilePos.x + sy * tilePos.y + ty;
       tilePos = new L.Point(px, py);
       tilePos = tilePos.subtract(this._level.origin);
     }

     el._leaflet_pos = tilePos;

     if (L.Browser.any3d) {
       var scale;
       el.style[L.DomUtil.TRANSFORM] =
         (L.Browser.ie3d ?
           'translate(' + tilePos.x + 'px,' + tilePos.y + 'px)' :
           'translate3d(' + tilePos.x + 'px,' + tilePos.y + 'px,0)') +
           (scale ? ' scale(' + scale + ')' : '') +
           (matrix ? matrix : '');

     } else {
       el.style.left = tilePos.x + 'px';
       el.style.top = tilePos.y + 'px';
     }
   //########################

     // save tile in cache
     this._tiles[key] = {
       el: tile,
       coords: coords,
       current: true
     };

     container.appendChild(tile);
     // @event tileloadstart: TileEvent
     // Fired when a tile is requested and starts loading.
     this.fire('tileloadstart', {
       tile: tile,
       coords: coords
     });
   },

   _pxBoundsToTileRange: function (bounds) {
     var tileSize = this.getTileSize();

     if (this.photo){ //because it can be a standard tilelayer like osm
       /*
       var m = this.photo.matrix;
       var tileMatrixSize = this.getTileSize().x * Math.pow(2, this._level.zoom);
       var imgw = tileMatrixSize;
       var imgh = Math.ceil(tileMatrixSize / 1.5);
       var tx = m.tx * imgw / 4288; //this.photo.WIDTH;
       var ty = m.ty * imgh / 2848;
       m = math.matrix([[m.sx, m.rx, tx], [m.ry, m.sy, ty], [0, 0, 1]]);
       mi = math.inv(m);
       var bmin = math.multiply(mi, [bounds.min.x, bounds.min.y, 0]).toArray();
       var bmax = math.multiply(mi, [bounds.max.x, bounds.max.y, 0]).toArray();
       bounds = new L.Bounds(bmin, bmax);
       //bounds.extend(bmin);
       //bounds.extend(bmax);
       */

       var buff = 1024;
       bounds.min = bounds.min.subtract( [buff, buff]);
       bounds.max = bounds.max.add( [buff, buff]);


     };

     return new L.Bounds(
       bounds.min.unscaleBy(tileSize).floor(),
       bounds.max.unscaleBy(tileSize).ceil().subtract([1, 1]));


   }/*,
   _setZoomTransform: function (level, center, zoom) {
     var scale = this._map.getZoomScale(zoom, level.zoom),
         translate = level.origin.multiplyBy(scale)
             .subtract(this._map._getNewPixelOrigin(center, zoom)).round();
     var el = level.el;
     var matrix;
     if (this.photo){ //can be a standard tilelayer like osm
       if (this.photo.FILENAME == '039_2014_CAUE48_3_D48_MJN_Hures') {
         var m = this.photo.matrix;
         var tileMatrixSize = this.getTileSize().x * Math.pow(2, level.zoom);
         var imgw = tileMatrixSize;
         var imgh = Math.ceil(tileMatrixSize / 1.5);
         //imgh = Math.ceil(imgh/256)*256; //round to upper multiple of tilesize
         el.style.width = imgw + 'px';
         el.style.height = imgh + 'px';
         var tx = m.tx * imgw / 4288; //this.photo.WIDTH;
         var ty = m.ty * imgh / 2848;
         matrix = ' matrix(' + [m.sx, m.ry, m.rx, m.sy, tx, ty].join(', ') + ')';
       }
     }
     if (L.Browser.any3d) {
       var pos = translate; //new L.Point(0, 0);
       el.style[L.DomUtil.TRANSFORM] =
         (L.Browser.ie3d ?
           'translate(' + pos.x + 'px,' + pos.y + 'px)' :
           'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
           (scale ? ' scale(' + scale + ')' : '') +
           (matrix ? matrix : '');
     } else {
       el._leaflet_pos = pos;
       el.style.left = pos.x + 'px';
       el.style.top = pos.y + 'px';
     }
   }*/


 });
