from . import settings
import bottle
import traceback
import requests
import sys
import json
try:
    import uwsgi
except:
    # ignore uwsgi when profiling
    pass

import xml.etree.ElementTree as ET


def get_child_value(node,child_name,namespaces):
    try:
        return node.find(child_name,namespaces=namespaces).text
    except:
        return None

def layermetadatakey(layerid):
    return "layermetadata_{}".format(layerid)

def layerdefinitionkey(layerid):
    return "layerdefinition_{}".format(layerid)

def get_kmiserver(kmiserver):
    if  kmiserver.endswith("/"):
        kmiserver = kmiserver[:-1]
    return kmiserver

def get_layermetadata(layers,results={}):
    multiple_layers = True
    if isinstance(layers,dict):
        layerids = [layers]
        multiple_layers = False
    #group layers against layer workspace
    unresolved_layers = {}
    for layer in layers:
        #check whether it is cached or not
        key = layermetadatakey(layer.id)
        if uwsgi.cache_exists(key):
            try:
                metadata = uwsgi.cache_get(key)
                if metadata:
                    if layer.id in results:
                        results[layer.id].update(json.loads(metadata))
                    else:
                        results[layer.id] = json.loads(metadata)
                    #print("Retrieve the metadata from cache for layer ({})".format(layerid))
                    continue
            except:
                pass

        if layer.wfsservice in unrsolved_layers:
            unresolved_layers[layer.wfsservice].append(layer.id)
        else:
            unresolved_layers[layer.wfsservice] = [layer.id]

    if unresolved_layers:
        session_cookie = settings.get_session_cookie()
        #find the layer's metadata 
        url = None
        for wfsservice, layerids in unresolved_layers:
            url = "{}?service=wfs&version=2.0.0&request=GetCapabilities".format(wfsservice)
            res = requests.get(
                url,
                verify=False,
                cookies=session_cookie
            )
            res.raise_for_status()
    
            namespaces = dict([(node[0].encode(),node[1]) for _, node in ET.iterparse(res.content.decode(), events=['start-ns'])])

            tree = ET.fromstring(res.content)

            capability = tree.find('wfs:FeatureTypeList',namespaces=namespaces)
            if not len(capability):
                raise Exception("getCapability failed")
            kmi_layers = capability.findall("wfs:FeatureType",namespaces=namespaces)
            for kmi_layer in kmi_layers:
                name = get_child_value(kmi_layer,"wfs:Name",namespaces)
                
                if name:
                    try:
                        index = layerids.index(name)
                    except:
                        index = -1
                    if index >= 0:
                        #this layer's metadata is requsted by the user
                        if name in results:
                            result = results[name]
                        else:
                            result = {"id":name}
                            results[name] = result

                        del layerids[index]
    
                        result["title"] = get_child_value(kmi_layer,"wfs:Title",namespaces)
                        result["abstract"] = get_child_value(kmi_layer,"wfs:Abstract",namespaces)
                        result["srs"] = get_child_value(kmi_layer,"wfs:DefaultCRS",namespaces)
                        bbox = kmi_layer.find("ows:WGS84BoundingBox",namespaces=namespaces)
                        if bbox is  not None:
                            lowercorner = get_child_value(bbox,"ows:LowerCorner",namespaces).split()
                            uppercorner = get_child_value(bbox,"ows:UpperCorner",namespaces).split()
                            result["latlonBoundingBox"] = [float(lowercorner[1]),float(lowercorner[0]),float(uppercorner[1]),float(uppercorner[0])]
                        else:
                            result["latlonBoundingBox"] = None
    
                        #cache it for 6 hours
                        key = layermetadatakey(result["id"])
                        try:
                            if uwsgi.cache_exists(key):
                                uwsgi.cache_update(key, json.dumps(result),6 * 3600)
                            else:
                                uwsgi.cache_set(key, json.dumps(result),6 * 3600)
                        except:
                            pass
                            
                        #print("Retrieve the metadata from kmi for layer ({})".format(result["id"]))
    
                        if len(layerids):
                            continue
                        else:
                            #already find metadata for all required layers
                            break
            
            if len(layerids) == 1:
                raise Exception("The layer({}) Not Found in WFS Service({})".format(layerids[0],wfsservice))
            elif len(layerids) > 1:
                raise Exception("The layers({}) Not Found in WFS Service({})".format(",".join(layerids),wfsservice))

    if multiple_layers:
        return results
    else:
        return results[layers[0].id]

def get_layerdefinition(layers,results={}):
    multiple_layers = True
    if isinstance(layers,dict):
        layerids = [layers]
        multiple_layers = False
    #group layers against layer workspace
    unresolved_layers = []
    for layer in layers:
        #check whether it is cached or not
        key = layerdefinitionkey(layer.id)
        if uwsgi.cache_exists(key):
            try:
                definitiondata = uwsgi.cache_get(key)
                if definitiondata:
                    if layerid in results:
                        results[layer.id].update(json.loads(definitiondata))
                    else:
                        results[layer.id] = json.loads(definitiondata)
                    continue
            except:
                pass

        unresolved_layers.append(layer)

    if unresolved_layers:
        session_cookie = settings.get_session_cookie()

        url = None
        for wfsservice,layerids in unresolved_layers:
            url = "{}?request=DescribeFeatureType&version=2.0.0&service=WFS&outputFormat=application%2Fjson&typeName=".format(wfsservice,",".join(layerids))

            res = requests.get(
                url,
                verify=False,
                cookies=session_cookie
            )
            res.raise_for_status()
            layersdata = res.json()

            for layer in layersdata.get("featureTypes") or []:
                if layer_ws:
                    layerid = "{}:{}".format(layer_ws,layer["typeName"])
                else:
                    layerid = layer["typeName"]
                try:
                    index = layers.index(layerid)
                except:
                    index = -1
                if index >= 0:
                    #this layer's metadata is requsted by the user
                    if layerid in results:
                        result = results[layerid]
                    else:
                        result = {"id":layerid}
                        results[layerid] = result

                    result["properties"] = layer["properties"]
                    result["geometry_property"] = None
                    result["geometry_properties"] = []
                    result["geometry_type"] = None
                    result["geometry_property_msg"] = None

                    del layers[index]

                    #find spatial columns
                    for prop in layer["properties"]:
                        if prop["type"].startswith("gml:"):
                            #spatial column
                            result["geometry_properties"].append(prop)


                    if len(result["geometry_properties"]) == 1:
                        result["geometry_property"] = result["geometry_properties"][0]
                        result["geometry_type"] = result["geometry_properties"][0]["localType"].lower()
                    elif len(result["geometry_properties"]) > 1:
                        #have more than one geometry properties, try to find the right one
                        if layer_ws:
                            url = "{}/{}/ows?service=WFS&version=2.0.0&request=GetFeature&typeName={}&count=1&outputFormat=application%2Fjson".format(kmiserver,layer_ws,layerid)
                        else:
                            url = "{}/ows?service=WFS&version=2.0.0&request=GetFeature&typeName={}&count=1&outputFormat=application%2Fjson".format(kmiserver,layerid)

                        res = requests.get(
                            url,
                            verify=False,
                            cookies=session_cookie
                        )
                        res.raise_for_status()
                        featuresdata = res.json()
                        if len(featuresdata["features"]) > 0:
                            feat = featuresdata["features"][0]
                            for prop in result["geometry_properties"]:
                                if prop["name"] == feat["geometry_name"]:
                                    result["geometry_property"] = prop
                                    result["geometry_type"] = prop["localType"].lower()
                                    break

                        if not result["geometry_property"]:
                            result["geometry_property_msg"] = "Layer '{}' has more than one geometry columns, can't identity which column is used as the geometry column.".format(layerid)
                    else:
                        result["geometry_property_msg"] = "Layer '{}' is not a spatial layer".format(layerid)

                    if result["geometry_property"]:
                        #found the geometry property, remove it from properties
                        index = len(result["properties"]) - 1
                        while index >= 0:
                            if result["properties"][index] == result["geometry_property"]:
                                #this is the geometry property,remove it from properties
                                del result["properties"][index]
                                break
                            index -= 1



                    #cache it for 1 day
                    key = layerdefinitionkey(layerid)
                    try:
                        if uwsgi.cache_exists(key):
                            uwsgi.cache_update(key, json.dumps(result),24 * 3600)
                        else:
                            uwsgi.cache_set(key, json.dumps(result),24 * 3600)
                    except:
                        pass
                        
        if len(layers) == 1:
            if layer_ws:
                raise Exception("The layer({}:{}) Not Found".format(layer_ws,layers[0]))
            else:
                raise Exception("The layer({}) Not Found".format(layers[0]))
        elif len(layers) > 1:
            if layer_ws:
                raise Exception("The layers({}) Not Found".format(",".join(["{}:{}".format(layer_ws,l) for l in layers])))
            else:
                raise Exception("The layers({}) Not Found".format(",".join(layers)))

    if multiple_layers:
        return results
    else:
        return results[layerids[0]]

def layermetadata():
    try:
        layers = bottle.request.query.get("layers")
        if not layers:
            raise Exception("Missing parameter 'layers'")
        else:
            layers = json.loads(layers)

        bottle.response.set_header("Content-Type", "application/json")
        results = get_layermetadata(layers)
        results = get_layerdefinition(layers,kmiserver,results=results)
        if len(layers) == 1:
            return results[layers[0]]
        else:
            return results
    except:
        if bottle.response.status < 400 :
            bottle.response.status = 400
        bottle.response.set_header("Content-Type","text/plain")
        traceback.print_exc()
        return traceback.format_exception_only(sys.exc_type,sys.exc_value)
    
