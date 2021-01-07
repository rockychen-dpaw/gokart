var env = {
    appType: (window.location.protocol == "file:")?"cordova":"webapp",
    
    srs:"EPSG:4326",
    layers:'http://sss-local.dbca.wa.gov.au:8080/dist/static/js/layers.json',
    //layers:"https://csw.dpaw.wa.gov.au/catalogue/api/records/?format=json&application__name=sss" ,


    wfsParams : {
       version: '1.1.0',
       service: 'WFS',
       request: 'GetFeature',
       outputFormat: 'application/json'
    },

    kmiService:"https://kmi.dbca.wa.gov.au/geoserver",

    gokartService:"",
    resourceTrackingService:"https://resourcetracking-uat.dbca.wa.gov.au",
    bfrsService:"https://bfrs-uat.dbca.wa.gov.au",
    staticService:"https://static.dbca.wa.gov.au",

    s3Service:"http://gokart.dpaw.io/",

    appMapping:{
        sss:"sss_uat",
    },
    layerMapping:{
        "dpaw:bushfirelist_latest"                  : "dpaw:bushfirelist_latest_uat",
        "dpaw:bushfire_latest"                      : "dpaw:bushfire_latest_uat",
        "dpaw:bushfire_final_fireboundary_latest"   : "dpaw:bushfire_final_fireboundary_latest_uat",
        "dpaw:bushfire_fireboundary_latest"         : "dpaw:bushfire_fireboundary_latest_uat",
        "dpaw:bushfire"                             : "dpaw:bushfire_uat",
        "dpaw:bushfire_fireboundary"                : "dpaw:bushfire_fireboundary_uat",
        "dpaw:resource_tracking_live"               : "dpaw:resource_tracking_live_uat",
        "dpaw:resource_tracking_history"            : "dpaw:resource_tracking_history_uat",
        "cddp:other_tenures"                        : "cddp:other_tenures_new"

    },
    overviewLayer:"dbca:mapbox-outdoors",

}


document.body.onload = function() {
    var setStyle = function (){
        var leftPanel = document.getElementById("offCanvasLeft");
        if (leftPanel) {
            leftPanel.style = "background-image:url('dist/static/images/uat.svg');background-size:cover;background-repeat:no-repeat;background-position:center center;"
        } else {
            setTimeout(setStyle,500)
        }
    }
    setTimeout(setStyle,500)
}
