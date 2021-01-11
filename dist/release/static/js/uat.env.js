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
