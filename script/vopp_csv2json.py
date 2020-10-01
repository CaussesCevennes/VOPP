# coding: utf-8
import sys
if sys.version_info[0] < 3:
    raise Exception("This program must run through Python 3")

import os, csv, json, re
from pathlib import Path
import argparse

class CSV2JSON:

    def __init__(self, input, keySep='.', arraySep=';', targetFields=[], csvSep='\t', csvNewLine='', csvEncoding="utf8", **kwargs):
        '''
        input : the csv filepath
        targetFields : list of fields names that will be transposed as json property (otherwise all fields will be used)
        '''
        self.input = input
        self.keySep = keySep
        self.arraySep = arraySep
        self.targetFields = targetFields
        self.csvSep = csvSep
        self.csvNewLine = csvNewLine
        self.csvEncoding = csvEncoding

    def _write(self, output, data, pretty=True):
        with open(output, 'w', encoding="utf8") as f:
            if pretty:
                f.write(json.dumps(data, indent=4, ensure_ascii=False))
            else:
                f.write(json.dumps(data, ensure_ascii=False))

    def _castNumbers(self, row):
        for k,v in row.items():
            if k == 'DATE':
                row[k] = str(v)
                continue
            if len(v) and all([l.isdigit() for l in v]):
                row[k] = int(v)
            else:
                try:
                    row[k] = float(v.replace(',', '.'))
                except ValueError:
                    pass
        return row

    def _splitRow(self, row):
        data = {}
        for k, v in row.items():
            #values with a semocolon char. will be treated as separated values into an array
            if self.arraySep:
                if type(v) is str and self.arraySep in str(v):
                    v = v.split(self.arraySep)
            #keys with a double underscore char. will be splitted into subdictionnaries
            if self.keySep in k:
                subKeys = k.split(self.keySep)
                subDict = data
                for i, subKey in enumerate(subKeys):
                    if i == len(subKeys)-1:
                        subDict[subKey] = v
                    else:
                        subDict = subDict.setdefault(subKey, {})
            else:
                data[k] = v
        return data

    def createJSON(self, output, keyField='', groupByKey=False, pretty=True, **kwargs):
        self._write(output, self.getJSON(keyField, groupByKey), pretty)

    def createGEOJSON(self, output, lonField='LON', latField='LAT', pretty=True, **kwargs):
        self._write(output, self.getGEOJSON(lonField, latField), pretty)

    def getJSON(self, keyField='', groupByKey=False, **kwargs):
        '''
        keyField : name of the field containing values that will be used as first level json key
        groupByKey : if True, row sharing same keyField value will be merged into a json array
        '''
        if keyField:
            data = {}
        else:
            data = []
        with open(self.input, 'r', newline=self.csvNewLine, encoding=self.csvEncoding) as f:
            reader = csv.DictReader(f, delimiter=self.csvSep)
            for row in reader:
                row = self._castNumbers(row)
                if keyField:
                    key = row[keyField]
                    row = {k:v for k,v in row.items() if k != keyField}
                if self.targetFields:
                    row = {k:v for k,v in row.items() if k in self.targetFields}
                row = self._splitRow(row)
                if groupByKey and keyField:
                    if key not in data:
                        data[key] = []
                    data[key].append(row)
                elif keyField:
                    data[key] = row
                else:
                    data.append(row)
        return data

    def getGEOJSON(self, lonField='LON', latField='LAT', **kwargs):
        data = { "type": "FeatureCollection", "features": [] }
        with open(self.input, 'r', newline=self.csvNewLine, encoding=self.csvEncoding) as f:
            reader = csv.DictReader(f, delimiter=self.csvSep)
            #propsFields = reader.fieldnames
            for row in reader:
                row = self._castNumbers(row)
                feat = { "type": "Feature", "properties": {}, "geometry": { "type": "Point", "coordinates": [] } }
                feat["geometry"]["coordinates"] = [ row[lonField], row[latField] ]
                if self.targetFields:
                    row = {k:v for k,v in row.items() if k not in [lonField, latField] and k in self.targetFields}
                feat["properties"] = self._splitRow(row)
                data["features"].append(feat)
        return data



if __name__ == '__main__':

    parser = argparse.ArgumentParser(description='Génére un GeoJSON à partir de deux tables csv : points de vue et photos')

    # Add the arguments
    parser.add_argument('csvPOV', metavar='csvfile-pov', type=str, help='Fichier csv listant les points de vue')
    parser.add_argument('csvPhotos', metavar='csvfile-photos', type=str, help='Fichier csv listant les photos')
    parser.add_argument('-o', '--output', type=str, help='Fichier geojson à générer')
    parser.add_argument('-pov', dest='povIdField', type=str, default='NUM', help='Libellé du champs indiquant le numéro du point de vue dans la table des photos')
    parser.add_argument('-lon', '--longitude', dest='lonField', type=str, default='LON', help='Libellé du champs indiquant la longitude')
    parser.add_argument('-lat', '--latitude', dest='latField', type=str, default='LAT', help='Libellé du champs indiquant la latitude')
    parser.add_argument('-ks', '--key-separator', dest='keySep', type=str, default='.', help='Caractère utilisé pour définir des propriétés enfants')
    parser.add_argument('-as', '--array-separator', dest='arraySep', type=str, default=';', help='Caractère utilisé pour séparer les valeurs dans un tableau')
    parser.add_argument('-f', '--fields', dest='targetFields', type=str, nargs='*', help='Liste des champs à inclure')
    parser.add_argument('-csv-sep', '--csv-separator', dest='csvSep', type=lambda v: '\t' if v == '\\t' else v, default='\t', help='Caractère séparateur du fichier csv')
    parser.add_argument('-csv-nl', '--csv-newline', dest='csvNewLine', type=str, default='', help='Caratère de fin de ligne du fichier csv')
    parser.add_argument('-csv-chart', '--csv-chartset', dest='csvEncoding', type=str, default='utf8', help='Encodage du fichier csv')
    parser.add_argument('-i', '--indent', action='store_true', help='Indique si le fichier geojson doit être indenté')

    args = parser.parse_args() #namespace
    kwargs = vars(args) #dict

    pov = CSV2JSON(args.csvPOV, **kwargs).getGEOJSON(**kwargs)
    photos = CSV2JSON(args.csvPhotos, **kwargs).getJSON(args.povIdField, True)

    for feat in pov['features']:
        feat['properties']['PHOTOS'] = photos[feat['properties']['NUM']]

    if not args.output:
        folder = os.path.dirname(__file__)
        output = os.path.join(folder, 'opp.geojson')
    else:
        output = args.output

    with open(output, 'w', encoding="utf8") as f:
        if args.indent:
            f.write(json.dumps(pov, indent=4, ensure_ascii=False))
        else:
            f.write(json.dumps(pov, ensure_ascii=False))
