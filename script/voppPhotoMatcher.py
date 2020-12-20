import cv2
import numpy as np

import os
import shutil

import json

from multiprocessing import cpu_count
#cv2.setNumThreads(cpu_count()-1)

#testing
def _match(a, b):
    return [[1,0,0], [0,1,0], [0,0,1]]

def match(im_path, im_ref_path, brutForce=False, output=None):
    '''
    Compute the 3x3 transformation matrix that transform im to match im_ref
    https://opencv-python-tutroals.readthedocs.io/en/latest/py_tutorials/py_feature2d/py_matcher/py_matcher.html
    https://stackoverflow.com/questions/14808429/classification-of-detectors-extractors-and-matchers
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

    # Create BFMatcher object with default parameters
    if brutForce:
        matcher = cv2.BFMatcher()
    else:
        matcher = cv2.FlannBasedMatcher()

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

    if output:
        print('Wrap image...')
        h, w, b = im.shape
        im_adjusted = cv2.warpPerspective(im, m, (w, h), cv2.INTER_LINEAR, borderValue=(255, 255, 255))
        cv2.imwrite(output, im_adjusted)

    #return json.dumps(m.tolist())
    return [[round(v, 4) for v in row] for row in m]


if __name__ == '__main__':

    NOMATCH = True

    folder = os.path.dirname(__file__)
    computedMatrices = folder + os.sep + 'matrices_flann.json'
    if os.path.exists(computedMatrices):
        with open(computedMatrices) as f:
            matrixData = json.load(f)
        shutil.copyfile(computedMatrices, computedMatrices + '.bck')
    else:
        matrixData = {}

    '''
    {
        idPov : {
            date1 : {
                date2 : matrix //transfo d1 to d2
            }
        }
    }
    '''

    #Add matrices to geojson

    geojson = "C:\\Users\\poste\\Desktop\\VOPP2\\src\\data\\opp_cc.geojson"
    photosDir = "C:\\Users\\poste\\Desktop\\VOPP2\\src\\photos"

    geojson = folder + os.sep + 'opp_cc.geojson'
    photosDir = "/mnt/DATA/opp/src/photos"

    pathTemplate = photosDir + os.sep +"CC\\{YEAR}\\{FILENAME}.jpg"

    with open(geojson, 'r', encoding="utf8") as f:
        data = json.load(f)
        for pov in data['features']:
            idPov = pov['properties']['NUM']

            for photo in pov['properties']['PHOTOS']:
                matrices = photo.setdefault('MATRIX', {})
                photo['YEAR'], photo['MONTH'], photo['DAY'] = photo['DATE'].split('-')
                d1 = photo['DATE']
                path1 = pathTemplate.format(**photo)

                for photoRef in pov['properties']['PHOTOS']:
                    if photo['DATE'] == photoRef['DATE']:
                        continue
                    photoRef['YEAR'], photoRef['MONTH'], photoRef['DAY'] = photoRef['DATE'].split('-')
                    d2 = photoRef['DATE']
                    path2 = pathTemplate.format(**photoRef)

                    print('Matching POV {} : {} > {}...'.format(idPov, photo['YEAR'], photoRef['YEAR']))
                    try:
                        matrix = matrixData[str(idPov)][d1][d2]
                    except KeyError:
                        if NOMATCH:
                            continue
                        try:
                            matrix = match(path1, path2)
                        except cv2.error as e:
                            print(e) #https://github.com/introlab/rtabmap_ros/issues/83
                            continue
                        else:
                            matrices[d2] = matrix
                            matrixData.setdefault(idPov, {}).setdefault(d1, {})[d2] = matrix
                            with open(computedMatrices, 'w', encoding="utf8") as f:
                                f.write(json.dumps(matrixData, indent=4))
                    else:
                        print(">> founded !")
                        matrices[d2] = matrix


    shutil.copyfile(geojson, geojson + '.bck')
    with open(geojson, 'w', encoding="utf8") as f:
        f.write(json.dumps(data, indent=4))
