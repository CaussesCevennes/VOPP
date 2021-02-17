import cv2
import numpy as np

import os
import shutil

import json
import argparse

from multiprocessing import cpu_count
cv2.setNumThreads(cpu_count()-1)

#testing
def _match(a, b):
    return [[1,0,0], [0,1,0], [0,0,1]]

def match(im_path, im_ref_path, method='BF', output_path=None):
    '''
    Compute the 3x3 transformation matrix that transform an image to match a reference image
    https://opencv-python-tutroals.readthedocs.io/en/latest/py_tutorials/py_feature2d/py_matcher/py_matcher.html
    https://stackoverflow.com/questions/14808429/classification-of-detectors-extractors-and-matchers

    - im_path : the path of the image that needs to be transformed
    - im_ref_path : the path of the reference image
    - method [optional, default 'BF'] : matcher algorithm, choice between 'BF' (Brute Force) or 'FLANN'
    - output_path [optional]: the path of the transformed image, if the path is not submited then
    the matrix will be computed but not applied

    return : transformation matrix array [[sx, rx, tx], [ry, sy, ty], [0, 0, 1]]

    '''

    #im = cv2.imread(im_path)
    #im_ref = cv2.imread(im_ref_path)
    #https://stackoverflow.com/a/57872297/8440810
    im = cv2.imdecode(np.fromfile(im_path, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    im_ref = cv2.imdecode(np.fromfile(im_ref_path, dtype=np.uint8), cv2.IMREAD_UNCHANGED)

    print('Compute SIFT...')

    # Initiate SIFT detector
    #sift = cv2.xfeatures2d.SIFT_create() #deprecated
    sift = cv2.SIFT_create()

    # Find keypoints and compute descriptors with SIFT
    kp_ref, des_ref = sift.detectAndCompute(im_ref, None)
    kp, des = sift.detectAndCompute(im, None)

    print('Match points...')

    # Create matcher object with default parameters
    if method == 'BF':
        matcher = cv2.BFMatcher()
    elif method == 'FLANN':
        matcher = cv2.FlannBasedMatcher()
    else:
        raise ValueError(f'Unknow matcher {method}')

    # Match descriptors
    matches = matcher.knnMatch(des, des_ref, k=2)

    # Store all the good matches as per Lowe's ratio test
    # Can play with variable factor:
    # if factor = 1, all matches are taken into account,  if factor = 0 none of them are considered
    good_matches = []
    factor = 0.6
    for m, n in matches:
        if m.distance < factor * n.distance:
            good_matches.append(m)

    # Retrieve your keypoints in `good_matches`
    good_kp = np.array([kp[match.queryIdx].pt for match in good_matches])
    good_kp_ref = np.array([kp_ref[match.trainIdx].pt for match in good_matches])

    # Find transformation
    m, mask = cv2.findHomography(good_kp, good_kp_ref, cv2.RANSAC, 5.0)

    if output_path:
        print('Wrap image...')
        h, w, b = im.shape
        im_adjusted = cv2.warpPerspective(im, m, (w, h), cv2.INTER_LINEAR, borderValue=(255, 255, 255))
        cv2.imwrite(output_path, im_adjusted)

    #return json.dumps(m.tolist())
    return [[round(v, 4) for v in row] for row in m]



def process(oppGeojson, filePathTemplate, matchMethod='BF'):
    '''
    {
        idPov : {
            date1 : {
                date2 : matrix //transfo from date1 to date2
            }
        }
    }
    '''

    NOMATCH = True # for testing

    #folder = os.path.dirname(__file__)
    folder = os.path.dirname(oppGeojson)
    computedMatrices = os.path.join(folder, f'matrices_{matchMethod}.json')
    if os.path.exists(computedMatrices):
        with open(computedMatrices) as f:
            matrixData = json.load(f)
        shutil.copyfile(computedMatrices, computedMatrices + '.bck')
    else:
        matrixData = {}

    #Add matrices to geojson
    with open(oppGeojson, 'r', encoding="utf8") as f:
        data = json.load(f)
        for pov in data['features']:
            idPov = pov['properties']['NUM']
            photos = pov['properties']['PHOTOS']

            for photo in photos:
                photo['YEAR'], photo['MONTH'], photo['DAY'] = photo['DATE'].split('-') #todo handle other kind of date format

                matrices = photo.setdefault('MATRIX', {}) #assign to data object
                d1 = photo['DATE']
                path1 = filePathTemplate.format(**photo)

                for photoRef in photos:
                    photoRef['YEAR'], photoRef['MONTH'], photoRef['DAY'] = photoRef['DATE'].split('-')

                    if photo['DATE'] == photoRef['DATE']:
                        continue

                    d2 = photoRef['DATE']
                    path2 = filePathTemplate.format(**photoRef)

                    print('Matching POV {} : {} > {}...'.format(idPov, photo['YEAR'], photoRef['YEAR']))
                    try:
                        matrix = matrixData[str(idPov)][d1][d2]
                    except KeyError:

                        if NOMATCH:
                            continue

                        #do not compute useless matrix
                        if 'PHOTOREF' in pov['properties']:
                            if int(photoRef['YEAR']) != pov['properties']['PHOTOREF']:
                                print('>> pair without ref')
                                continue

                        try:
                            matrix = match(path1, path2, matchMethod)
                        except cv2.error as e:
                            print(e) #https://github.com/introlab/rtabmap_ros/issues/83
                            continue
                        else:
                            matrices[d2] = matrix
                            matrixData.setdefault(idPov, {}).setdefault(d1, {})[d2] = matrix
                            #update the backup file immediately to avoid loosing the data
                            with open(computedMatrices, 'w', encoding="utf8") as f:
                                f.write(json.dumps(matrixData, indent=4))
                    else:
                        print(">> founded !")
                        matrices[d2] = matrix
                        matrixData.setdefault(idPov, {}).setdefault(d1, {})[d2] = matrix


    #filter unwanted matrices
    for pov in data['features']:
        p = pov['properties']
        for photo in p['PHOTOS']:
            if int(photo['DATE'].split('-')[0]) == p['PHOTOREF']:
                photo['MATRIX'] = {}
            else:
                photo['MATRIX'] = {d:m for d, m in photo['MATRIX'].items() if int(d.split('-')[0]) == p['PHOTOREF']}

    #shutil.copyfile(oppGeojson, oppGeojson + '.bck')
    f, e = os.path.splitext(oppGeojson)
    ouPath = f + '_match' + e
    with open(ouPath, 'w', encoding="utf8") as f:
        f.write(json.dumps(data, indent=4))




if __name__ == '__main__':

    parser = argparse.ArgumentParser(description='Compute photomatch matrices')

    parser.add_argument(
        'oppGeojson',
        metavar = 'opp-geojson',
        type = str,
        help = 'Input geojson file'
    )

    parser.add_argument(
        "filePathTemplate",
        metavar = 'filepath-template',
        type = str,
        help = "Template string of filename",
    )

    parser.add_argument(
        '-m',
        '--match-method',
        dest = 'matchMethod',
        type = str,
        default = 'BF',
        help = "Match method BF ou FLANN",
    )


    args = parser.parse_args() #namespace
    kwargs = vars(args) #dict

    process(**kwargs)
