var layerConfigs={
   "dpaw:bushfirelist_latest":{
       "getFeatureInfo":function (f) {
            return {
                "name":f.get("fire_number"), 
                "img":map.getBlob(f, ['icon', 'tint']), 
                "comments":f.get('name') + "(" + (vm._reportStatusName[f.get('report_status')] || vm._reportStatusName[99999]) + ")"
            }
        },
   }
}
