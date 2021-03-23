var env = {
    appType: (window.location.protocol == "file:")?"cordova":"webapp",
    
    srs:"EPSG:4326",
    layers:'https://sss-dev.dbca.wa.gov.au/dist/static/js/ssslayers.json',
    //layers:"https://csw.dpaw.wa.gov.au/catalogue/api/records/?format=json&application__name=sss" ,


    kmiService:"https://kmi.dbca.wa.gov.au/geoserver",

    resourceTrackingService:"https://resourcetracking-uat.dbca.wa.gov.au",
    bfrsService:"https://bfrs-uat.dbca.wa.gov.au",
    staticService:"https://static.dbca.wa.gov.au",

    s3Service:"http://gokart.dpaw.io/",

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
