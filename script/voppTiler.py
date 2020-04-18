# coding: utf-8
import sys, os
if sys.version_info[0] < 3:
    raise Exception("This program must run through Python 3")

import logging
logging.basicConfig(level=logging.getLevelName('INFO'))

import shutil
import argparse
import math
import json

from PIL import Image

'''
A simple but versatile image tiler


Inspired from https://github.com/openzoom/deepzoom.py
'''


class TilesProfile():

    def __init__(self, imgWidth, imgHeight, tileSize, initRes='TILESIZE', zFactor=2):
        self.imgWidth = imgWidth
        self.imgHeight = imgHeight
        self.initRes = initRes # ['IMAGESIZE', 'TILESIZE']
        self.tileSize = tileSize
        self.zFactor = zFactor

    @property
    def aspectRatio(self):
        return self.imgWidth / self.imgHeight

    @property
    def isLandscape(self):
        return self.aspectRatio >= 1

    @property
    def maxImgSize(self):
        return max(self.imgWidth, self.imgHeight)

    @property
    def maxZoom(self):
        """maximum zoom level of the pyramid"""
        return int(math.ceil(math.log(self.maxImgSize / self.tileSize, self.zFactor)))

    @property
    def nZoom(self):
        """number of zoom levels in the pyramid"""
        return self.maxZoom + 1

    def getScaleFactor(self, z):
        """scale of a pyramid level"""
        if self.initRes == 'TILESIZE':
            return self.zFactor**z
        elif self.initRes == 'IMAGESIZE':
            return self.zFactor**(self.maxZoom - z)

    def getImageSize(self, z):
        """Size of the image at a given zoom level"""
        scale = self.getScaleFactor(z)
        if self.initRes == 'IMAGESIZE':
            w = self.imgWidth / scale
            h = self.imgHeight / scale
        elif self.initRes == 'TILESIZE':
            #largest dim of the image should fit the tile matrix size
            tileMatrixSize = self.tileSize * scale #square
            if self.isLandscape:
                w = tileMatrixSize
                h = tileMatrixSize / self.aspectRatio
            else:
                w = tileMatrixSize * self.aspectRatio
                h = tileMatrixSize
        return tuple(map(math.ceil, (w, h)))

    def getTileMatrixSize(self, z):
        """The number of non empty tiles at a given zoom level"""
        w, h = self.getImageSize(z)
        return (
            int(math.ceil(w / self.tileSize)),
            int(math.ceil(h / self.tileSize)),
        )

    def getLevelSize(self, z):
        """The full size of a zoom level counting all non empty tiles"""
        return [dim * self.tileSize for dim in self.getTileMatrixSize(z)]

    def getImageSizes(self):
        return [self.getImageSize(z) for z in range(self.nZoom)]

    def getTileMatrixSizes(self):
        return [self.getTileMatrixSize(z) for z in range(self.nZoom)]

    def getLevelSizes(self):
        return [self.getLevelSize(z) for z in range(self.nZoom)]

    def dump(self, outFile=None):
        profile = {
            'original_size' : [self.imgWidth, self.imgHeight],
            'tile_size' : self.tileSize,
            'zoom_factor' : self.zFactor,
            'max_level' : self.maxZoom,
            'image_sizes' : self.getImageSizes(),
            'matrix_size' : self.getTileMatrixSizes(),
            'level_sizes' : self.getLevelSizes()
        }
        if not outFile:
            return profile
        else:
            with open(outFile, 'w', encoding="utf8") as f:
                f.write(json.dumps(profile))


RESIZE_FILTERS = {
    "cubic": Image.CUBIC,
    "bilinear": Image.BILINEAR,
    "bicubic": Image.BICUBIC,
    "nearest": Image.NEAREST,
    "lanczos": Image.LANCZOS,
}


class VOPPTiler():

    def __init__(self, inFile, outFolder, tileSize=256, overlap=0, initRes='TILESIZE', zFactor=2, cropTiles=False, tileFormat="jpg", jpgQuality=75, resizeFilter='lanczos', pathFormat = '{z}_{x}_{y}'):
        self.src = inFile
        self.dst = outFolder

        self.image = Image.open(inFile)
        w, h = self.image.size

        if tileSize == 'auto':
            tileSize = bestTileSize(max(w,h), zFactor=zFactor)

        self.profile = TilesProfile(w, h, tileSize, initRes, zFactor)

        self.overlap = overlap
        self.cropTiles = cropTiles
        self.pathFormat = pathFormat + '.' + tileFormat

        self.tileFormat = tileFormat
        self.jpgQuality = jpgQuality
        self.resizeFilter = RESIZE_FILTERS[resizeFilter]

        self.bkgColor = (255, 255, 255)

    @property
    def tileSize(self):
        return self.profile.tileSize

    def iterTiles(self, z):
        cols, rows = self.profile.getTileMatrixSize(z)
        for col in range(cols):
            for row in range(rows):
                yield (col, row)

    def getTile(self, img, z, col, row):
        x = col * self.tileSize
        y = row * self.tileSize

        ncols, nrows = self.profile.getTileMatrixSize(z)
        imgWidth, imgHeight = self.profile.getImageSize(z)

        if col == ncols-1:
            if self.cropTiles:
                w = min(self.tileSize, imgWidth - x)
            else:
                w = self.tileSize
        else:
            w = self.tileSize + self.overlap
        if row == nrows-1:
            if self.cropTiles:
                h = min(self.tileSize, imgHeight - y)
            else:
                h = self.tileSize
        else:
            h = self.tileSize + self.overlap

        tile = Image.new('RGB', (w, h), self.bkgColor)
        tile.paste(img, (-x, -y))
        return tile

    def getImage(self, z):
        """Returns the resized image at the given level"""
        w, h = self.profile.getImageSize(z)
        if self.image.size == (w, h):
            return self.image
        logging.debug(' >> Create base image for level {} : redim. from {} to {}'.format(z, self.image.size, (w, h)))
        return self.image.resize((w, h), self.resizeFilter)

    def seed(self):
        """Creates tiles from source file and saves it to destination folder"""

        logging.info('Tiling {} into {}'.format(self.src, self.dst))

        if not os.path.exists(self.dst):
            os.makedirs(self.dst)
        else:
            shutil.rmtree(self.dst) #purge

        for level in range(self.profile.nZoom):

            img = self.getImage(level)

            for (col, row) in self.iterTiles(level):

                tile = self.getTile(img, level, col, row)

                tilePath = os.path.join(self.dst, self.pathFormat.format(x=col, y=row, z=level))
                if not os.path.exists(os.path.dirname(tilePath)):
                    os.makedirs(os.path.dirname(tilePath))

                tileFile = open(tilePath, "wb")
                if self.tileFormat == "jpg":
                    tile.save(tileFile, "JPEG", quality=self.jpgQuality)
                else:
                    tile.save(tileFile) #will autodetect format with extension

        dumpPath = os.path.join(self.dst, 'profile.json')
        logging.info('Writing profile informations to {}'.format(dumpPath))
        self.profile.dump(dumpPath)



def bestTileSize(targetWidth, minTileSize = 128, maxTileSize = 512, zFactor = 2):
    """
    Search for the best tile size such as the tile matrix width for the maximum
    zoom level matches near as possible the original image width.
    The resulting tilesize can then be choosen to reduce the image oversampling
    when tiling is based on first tilesize (option init-size = TILESIZE).
    This function use a brute force approach !
    """
    scores = []
    for tileSize in range(minTileSize, maxTileSize+1, 1):
      maxZ = int(math.ceil(math.log(targetWidth / tileSize, zFactor)))
      maxWidth = tileSize * zFactor**maxZ
      delta = abs(maxWidth - targetWidth)
      result = {'tileSize':tileSize, 'maxZ':maxZ, 'maxWidth':maxWidth, 'delta':delta}
      scores.append(result)
    scores.sort(key=lambda x : x['delta'])
    print("Best canditate for a width of {} : {}".format(targetWidth, scores[0]))
    return scores[0]['tileSize']


def main():
    parser = argparse.ArgumentParser(description='A simple but versatile image tiler')

    parser.add_argument(
        "inFile",
        metavar='source',
        help="Source image file",
    )
    parser.add_argument(
        "-d",
        "--destination",
        dest="outFolder",
        help="Destination folder of the output, a new directory named accordingly to the input file will be created inside this destinaton folder",
    )
    parser.add_argument(
        "-s",
        "--tile-size",
        dest="tileSize",
        #type=int,
        default=256,
        help="Size of the tiles, can be set to 'auto' to let the tiler determine itself the best size",
    )
    parser.add_argument(
        "-o",
        "--overlap",
        dest="overlap",
        type=int,
        default=0,
        help="Number of overlaping pixels. Will increase the final tile size by expanding it by the overlap value on the right and bottom",
    )
    parser.add_argument(
        "-i",
        "--init-size",
        dest="initRes",
        choices=['IMAGESIZE','TILESIZE'],
        default='TILESIZE',
        help="Define if the tiling process should start from the image at full resolution or from the tile size. In the first case, the highest zoom level with match the image original resolution but the first tile will have margins in both directions. With the second option, the first tile will be fulfilled by the largest dimension of the image but the last level will be oversampled.",
    )
    parser.add_argument(
        "-t",
        "--template-tree",
        dest="pathFormat",
        type=str,
        default='{z}_{x}_{y}',
        help="Path template for saving tiles files",
    )
    parser.add_argument(
        "-c",
        "--crop-tiles",
        dest="cropTiles",
        action='store_true',
        help="Crop unfulfilled tiles",
    )
    parser.add_argument(
        "-z",
        "--zoom-factor",
        dest="zFactor",
        type=int,
        default=2,
        help="Zoom factor between each pyramid's levels",
    )

    parser.add_argument(
        "-f",
        "--tile-format",
        dest="tileFormat",
        choices=['jpg', 'png'],
        default='jpg',
        help="Image format of the tiles (jpg or png). Default: jpg",
    )
    parser.add_argument(
        "-q",
        "--jpeg-quality",
        dest="jpgQuality",
        type=int,
        choices=range(0, 101),
        metavar="[0-100]",
        default=75,
        help="Quality of the image output (0-100). Default: 75",
    )
    parser.add_argument(
        "-r",
        "--resize-filter",
        dest="resizeFilter",
        choices=['nearest', 'bilinear', 'bicubic', 'lanczos'],
        default='lanczos',
        help="Type of filter for resizing the image",
    )


    args = parser.parse_args() #namespace

    if not os.path.exists(args.inFile):
        logging.error('Invalid input file')
        sys.exit(1)

    #regardless of the destination folder provided, the tiles will always be added
    #into a new directory named accordingly to the input file (TODO add an option to control this folder name)
    if not args.outFolder:
        #if there is no destination provided then the new directory of tiles will be
        #created in the same folder as the input file
        args.outFolder = os.path.splitext(args.inFile)[0]
    else:
        #otherwise it will be created into the specified destination folder
        args.outFolder = os.path.join(args.outFolder, os.path.splitext(os.path.basename(args.inFile))[0])

    if os.path.exists(args.outFolder):
        logging.warning('Destination folder already exists, it\'s content will be overwritten')

    #check path template
    if not all([k in args.pathFormat for k in ['{x}', '{y}', '{z}']]):
        logging.error('Invalide path template. The template {} does not include {}'.format(args.pathFormat, ['{x}', '{y}', '{z}']))
        sys.exit(1)

    kwargs = dict(vars(args))

    tiler = VOPPTiler(**kwargs)
    tiler.seed()



if __name__ == "__main__":
    main()
