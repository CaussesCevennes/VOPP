# coding: utf-8
import sys
if sys.version_info[0] < 3:
    raise Exception("This program must run through Python 3")

import os, shutil
import csv
import argparse

from PIL import Image, ImageDraw, ImageFont


def watermark(
        csvPhotos,
        inFolder,
        outFolder,
        filenameTemplate,
        watermarkTemplate,
        txtColor = (255, 255, 255, 200),
        bkgColor = (0, 0, 0, 150),
        fontfamilly = "arial",
        position = "bottomright",
        #size values are expressed as per-mile of image height
        fontsize = 20,
        padding = 10,
        margin = 10,
        #csv options
        csvSep='\t',
        csvNewLine='',
        csvEncoding="utf8",
        **kwargs
    ):

    imagesExtensions = ['.jpg', '.png', '.tif', '.tiff']
    imagesExtensions.extend([ext.upper() for ext in imagesExtensions])

    fontfamilly = fontfamilly + '.ttf'

    txtColor = tuple(txtColor)
    bkgColor = tuple(bkgColor)

    if not os.path.exists(outFolder):
        os.makedirs(outFolder)

    with open(csvPhotos, 'r', newline=csvNewLine, encoding=csvEncoding) as f:
        data = csv.DictReader(f, delimiter=csvSep)

        for row in data:

            filename = filenameTemplate.format(**row)
            if filename[-4:] not in imagesExtensions:
                continue

            path = inFolder + os.sep + filename
            if not os.path.exists(path):
                continue

            markText = watermarkTemplate.format(**row)

            img = Image.open(path)
            w, h = img.size

            _fontsize = int(h * fontsize / 1000)
            _margin = int(h * margin / 1000)
            _padding = int(h * padding / 1000)

            font = ImageFont.truetype(fontfamilly, _fontsize)

            #get dimensions of the watermark text
            draw = ImageDraw.Draw(img) #make img editable
            textWidth, textHeight = draw.textsize(markText, font)

            #create new watermark image
            markWidth = textWidth + _padding * 2
            markHeight = textHeight + _padding * 2
            mark = Image.new('RGBA', (markWidth, markHeight), bkgColor )
            draw = ImageDraw.Draw(mark)
            draw.text((_padding, _padding), markText, fill=txtColor, font=font)

            #Set the position
            if position.startswith('top'):
                y = int( _margin )
            elif position.startswith('bottom'):
                y = int( h - markHeight - _margin )
            if position.endswith('left'):
                x = int( _margin )
            elif position.endswith('right'):
                x = int( w - markWidth - _margin )
            pos = (x, y)

            #paste the watermark
            #nota : if you paste an “RGBA” image, the alpha band is ignored. You can
            #work around this by using the same image as both source image and mask
            img.paste(mark, pos, mark)
            img.save(outFolder + os.sep + filename)


if __name__ == '__main__':

    parser = argparse.ArgumentParser(description='Batch photo watermarking')

    parser.add_argument(
        'csvPhotos',
        metavar = 'csvfile-photos',
        type = str,
        help = 'csv files of photos list'
    )

    parser.add_argument(
        "inFolder",
        metavar = 'source-folder',
        help = "Folder containing the images files",
    )

    parser.add_argument(
        "outFolder",
        metavar = 'dest-folder',
        help = "Destination folder of the watermarked images",
    )

    parser.add_argument(
        "filenameTemplate",
        metavar = 'filename-template',
        help = "Template string of filename",
    )

    parser.add_argument(
        "watermarkTemplate",
        metavar = 'wartermark-template',
        help = "Template string of watermark",
    )

    parser.add_argument(
        "-c",
        "--text-color",
        dest = 'txtColor',
        nargs = '+',
        type = int,
        default = [255, 255, 255, 255],
        help = "RGBA color of the watermark text",
    )

    parser.add_argument(
        "-bg",
        "--background-color",
        dest = 'bkgColor',
        nargs = '+',
        type = int,
        default = [0, 0, 0, 150],
        help = "RGBA color of the watermark background",
    )

    parser.add_argument(
        "-ff",
        "--font-familly",
        dest = 'fontfamilly',
        type = str,
        default = 'arial',
        help = "The true type font familly (name of ttf file)",
    )

    parser.add_argument(
        "-fs",
        "--font-size",
        dest = 'fontsize',
        type = int,
        default = 20,
        help = "The font size expressed as per-mile of image height",
    )

    parser.add_argument(
        "-pos",
        "--position",
        dest = 'position',
        choices = ['topleft', 'topright', 'bottomleft', 'bottomright'],
        default = 'bottomright',
        help = "The position of the watermark",
    )

    parser.add_argument(
        "-pad",
        "--padding",
        dest = 'padding',
        type = int,
        default = 10,
        help = "The padding value expressed as per-mile of image height",
    )

    parser.add_argument(
        "-mg",
        "--margin",
        dest = 'margin',
        type = int,
        default = 10,
        help = "The margin value expressed as per-mile of image height",
    )

    parser.add_argument(
        '-csv-sep',
        '--csv-separator',
        dest = 'csvSep',
        type = lambda v: '\t' if v == '\\t' else v,
        default = '\t',
        help = 'Caractère séparateur du fichier csv'
    )

    parser.add_argument('-csv-nl',
        '--csv-newline',
        dest = 'csvNewLine',
        type = str,
        default = '',
        help = 'Caratère de fin de ligne du fichier csv'
    )

    parser.add_argument(
        '-csv-chart',
        '--csv-chartset',
        dest = 'csvEncoding',
        type = str,
        default = 'utf8',
        help = 'Encodage du fichier csv'
    )

    args = parser.parse_args() #namespace
    kwargs = vars(args) #dict

    watermark(**kwargs)
