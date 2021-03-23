import {

  $,
  svg4everybody,
  ol,
  proj4,
  moment,
  localforage,
  Vue,
  VueStash,
  utils
} from 'src/vendor.js'
import App from './sss.vue'
import tour from './sss-tour.js'
import profile from './sss-profile.js'
import gokartListener from './gokart-listener.js'

//merge _env into env
if (global._env) {
    $.each(global._env,function(key,value){env[key] = value})

    global._env = undefined
}

global.tour = tour

global.debounce = function (func, wait, immediate) {
  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  'use strict'
  var timeout
  return function () {
    var context = this
    var args = arguments
    var later = function () {
      timeout = null
      if (!immediate) func.apply(context, args)
    }
    var callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, (context && context.wait) || wait)
    if (callNow) func.apply(context, args)
  }
}
var volatileData = {
  // overridable defaults for WMTS and WFS loading
  appType:env.appType,
  // fixed scales for the scale selector (1:1K increments)
  fixedScales: [0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 80, 100, 125, 250, 500, 1000, 2000, 3000, 5000, 10000, 25000],
  // default matrix from KMI
  resolutions: [0.17578125, 0.087890625, 0.0439453125, 0.02197265625, 0.010986328125, 0.0054931640625, 0.00274658203125, 0.001373291015625, 0.0006866455078125, 0.0003433227539062, 0.0001716613769531, 858306884766e-16, 429153442383e-16, 214576721191e-16, 107288360596e-16, 53644180298e-16, 26822090149e-16, 13411045074e-16],
  mmPerInch: 25.4,
  displayResolution:[1,1],
  whoami: { email: null },
  layout:{
      screenHeight:0,
      hintsHeight:0,
      screenWidth:0,
      leftPanelHeadHeight:90,
  },
  activeMenu:null,
  activeSubmenu:null,
  hints:null,
  showHints:false,
  // filters for finding layers
  catalogueFilters: [
    ['basemap', 'Base Imagery'],
    ['boundaries', 'Admin Boundaries'],
    ['communications', 'Communications'],
    ['fire', 'Fire Operations'],
    ['meteorology', 'Meteorology'],
    ['vegetation', 'Vegetation'],
    ['tenure', 'Tenure and Land Use'],
    ['infrastructure', 'Infrastructure'],
    ['grid', 'Grid Systems'],
    ['resources', 'Resource Tracking']
  ],
  matrixSets: {
    'gda94': {
        'tileSize':1024,
        "extent": [-180, -90, 180, 90],
        'srs':'EPSG:4326',
        'name': 'gda94',
        'minLevel': 0,
        'maxLevel': 17
    }
  }
}

var systemSettings = {
  tourVersion: null,
  undoLimit:0,
  lengthUnit:"km",
  areaUnit:"ha",
  measureFeature:false,
  print:{
      retainBoundingbox:true,
      snapToFixedScale:true,
  },
  overviewMap:true,
  hoverInfo:false,
  resourceLabels:true,
  resourceDirections: true,
  viewportOnly: false,
  rightHandTools: true,
  graticule:true,
  bfrs:{
      bushfireLabels:true,
      viewportOnly: false,
  },
  weatheroutlook:{
      "weather-outlook-customized":null,
      "weather-outlook-amicus":null
  }
}

var persistentData = {
  view: {
    center: [123.75, -24.966],
    scale:4026092
  },
  // id followed by properties to merge into catalogue
  activeLayers: [
    ['dpaw:resource_tracking_live', {}],
    ['cddp:state_map_base', {}]
  ],
  // blank annotations
  annotations: {
    type: 'FeatureCollection',
    features: []
  },
  drawingLogs:[],
  redoPointer:0,//pointer to the next redo log 
  drawingSequence:0,

  //data in settings will survive across reset
  settings:JSON.parse(JSON.stringify(systemSettings))
}
global.localforage = localforage
global.$ = $

var resetRe = new RegExp('^\\?([^?]*&)?reset=true(&.*)?$','i')
var result = resetRe.exec(window.location.search)
if (result) {
    localforage.setItem('sssOfflineStore', {}).then(function (v) {
        var searchString = (result[1]?result[1]:"") + ((result[2] && result[2].length > 1)?result[2].substring(1):"")
        document.location.search = (searchString.length === 0)?"":("?" + (result[1]?result[1]:"") + ((result[2] && result[2].length > 1)?result[2].substring(1):""))
    })
} else {
    Vue.use(VueStash)
    localforage.getItem('sssOfflineStore').then(function (store) {
      if (store && store["activeLayers"] && store["activeLayers"].length === 0) {
          delete store["activeLayers"]
      }
      var storedData = utils.extend(JSON.parse(JSON.stringify(persistentData)), store || {}, volatileData)
    
      global.gokart = new Vue({
        el: 'body',
        components: {
          App
        },
        data: {
          // store contains state we want to reload/persist
          store: storedData,
          pngs: {},
          layerConfigs:[],
          saved: null,
          touring: false,
          menuRevision:1,
          tints: {
            'selectedPoint': [['#b43232', '#2199e8']],
            'selectedDivision': [['#000000', '#2199e8'], ['#7c3100','#2199e8'], ['#ff6600', '#ffffff']],
            'selectedRoadClosurePoint': [['#000', '#2199e8']],
            'selectedPlusIcon': [['#006400', '#2199e8']],
          }
        },
        computed: {
          loading: function () { return this.$refs.app.$refs.loading },
          dialog: function () { return this.$refs.app.$refs.dialog },
          map: function () { return this.$refs.app.$refs.map },
          scales: function () { return this.$refs.app.$refs.map.$refs.scales },
          search: function () { return this.$refs.app.$refs.map.$refs.search },
          featuredetail: function () { return this.$refs.app.$refs.map.$refs.featuredetail },
          weatherforecast: function () { return this.$refs.app.$refs.map.$refs.weatherforecast },
          toolbox: function () { return this.$refs.app.$refs.map.$refs.toolbox },
          measure: function () { return this.$refs.app.$refs.map.$refs.measure },
          info: function() { return this.$refs.app.$refs.map.$refs.info},
          active: function () { return this.$refs.app.$refs.layers.$refs.active },
          layers: function () { return this.$refs.app.$refs.layers },
          catalogue: function () { return this.$refs.app.$refs.layers.$refs.catalogue },
          export: function () { return this.$refs.app.$refs.layers.$refs.export },
          annotations: function () { return this.$refs.app.$refs.annotations },
          tracking: function () { return this.$refs.app.$refs.tracking },
          settings: function () { return this.$refs.app.$refs.settings },
          systemsetting: function () { return this.$refs.app.$refs.settings.$refs.systemsetting },
          bfrs: function () { return this.$refs.app.$refs.bfrs },
          weatheroutlook: function () { return this.$refs.app.$refs.settings.$refs.weatheroutlook },
          geojson: function () { return new ol.format.GeoJSON() },
          wgs84Sphere: function () { return new ol.Sphere(6378137) },
          profile: function(){return profile},
          app: function() {return "SSS"},
          utils: function() {return utils},
          env:function() {return env},
          persistentData:function() {
              return utils.extract(persistentData,this.store)
          },
          tourVersion:function() {
              return this.store.settings.tourVersion
          },
          defaultSettings:function() {
              return systemSettings
          },
          screenHeight:function() {
              return this.store.layout.screenHeight
          },
          hints:function() {
              return this.store.hints
          },
          activeModule:function() {
             return this.store.activeSubmenu || this.store.activeMenu
          },
          isShowHints:function() {
              return this.store.showHints && this.store.hints
          },
          hasHints:function() {
              return this.store.hints
          },
        },
        watch: {
            tourVersion:function(newValue,oldValue) {
                if (newValue !== tour.version) {
                  this.takeTour()
                }
            },
            hints:function(newValue,oldValue) {
                var vm = this
                this.$nextTick(function(){
                    vm.setHintsHeight()
                })
            },
            menuRevision:function(newValue,oldValue) {
                var vm = this
                //var module = this.store.activeSubmenu || this.store.activeMenu
                //if (this[module]["adjustHeight"]) {
                //    this[module]["adjustHeight"]()
                //}
                this.$nextTick(function(){
                    vm.store.layout.leftPanelHeadHeight = $("#" + vm.activeModule + "-tabs").height() || 90
                    vm.setHintsHeight()
                })
            },
            screenHeight:function(newValue,oldValue) {
                var module = this.store.activeSubmenu || this.store.activeMenu
                if (this[module]["adjustHeight"]) {
                    this[module]["adjustHeight"]()
                }
                this.loading.adjustHeight()
            }
        },
        methods: {
          setHintsHeight:function() {
            if (this[this.activeModule]["adjustHeight"]) {
                this.store.layout.hintsHeight = (this.isShowHints?$("#hints").height():0) + (this.hasHints?32:0)
                this[this.activeModule]["adjustHeight"]()
            }
          },
          menuChanged:function() {
              this.menuRevision += 1
          },
          takeTour: function() {
              this.store.settings.tourVersion = tour.version
              this.export.saveState()
              this.touring = true
              tour.start()
          },
          setHints:function() {
              this.store.hints = null
              this.store.showHints = false
              var module = this.store.activeSubmenu || this.store.activeMenu
              if (module && this[module]) {
                if (arguments.length === 0 ) {
                    this.store.hints = null
                } else if (arguments.length === 1) {
                    this.store.hints = arguments[0]
                } else {
                    this.store.hints = arguments
                }
              }
          }
        },
        ready: function () {
          var self = this
          self.loading.app.phaseBegin("initialize",20,"Initialize")
          // setup foundation, svg url support
          $(document).foundation()
          svg4everybody()
          // set title
          $('title').text(profile.description)
          // calculate screen res
          $('body').append('<div id="dpi" style="width:1in;display:none"></div>')
          self.dpi = parseFloat($('#dpi').width())
          self.store.dpmm = self.dpi / self.store.mmPerInch
          $('#dpi').remove();
          // get user info
          (function () {
            $.ajax({
                url: "/sso/auth",
                method:"GET",
                dataType:"json",
                success: function (response, stat, xhr) {
                    $.extend(self.store.whoami,response)
                },
                error: function (xhr,status,message) {
                    $.extend(self.store.whoami,{"username": "RockyC", "shared_id": "a73351f6262821b04179c559750079b312846cc8a9a2262f3314609dacc2ced3", "first_name": "Rocky", "last_name": "Chen", "client_logon_ip": "139.130.215.10", "session_key": "arnpq7peh8l8eae70calje7lk4gfqprt", "email": "rocky.chen@dbca.wa.gov.au"})
                    //alert("Get user profile failed.  " + status + " : " + (xhr.responseText || message))
                },
                xhrFields: {
                  withCredentials: true
                }
            })
          })()
          // bind menu side-tabs to reveal the side pane
          var offCanvasLeft = $('#offCanvasLeft')
          $('#menu-tabs').on('change.zf.tabs', function (ev) {
            offCanvasLeft.addClass('reveal-responsive')
            self.map.olmap.updateSize()
          }).on('click', '.tabs-title a[aria-selected=false]', function (ev) {
            offCanvasLeft.addClass('reveal-responsive')
            $(this).attr('aria-selected', true)
            self.map.olmap.updateSize()
          }).on('click', '.tabs-title a[aria-selected=true]', function (ev) {
            offCanvasLeft.toggleClass('reveal-responsive')
            self.map.olmap.updateSize()
          })
          $('#side-pane-close').on('click', function (ev) {
            offCanvasLeft.removeClass('reveal-responsive')
            $('#menu-tabs').find('.tabs-title a[aria-selected=true]').attr('aria-selected', false)
            self.map.olmap.updateSize()
          })
    
          // load custom annotation tools
    
          var sssTools = [
            {
              name: 'Fire Boundary',
              icon: 'dist/static/images/iD-sprite.svg#icon-area',
              style: self.annotations.getVectorStyleFunc(self.tints),
              selectedFillColour:[0, 0, 0, 0.25],
              fillColour:[0, 0, 0, 0.25],
              size:2,
              interactions: [self.annotations.polygonDrawFactory()],
              scope:["annotation"],
              showName: true,
              measureLength:true,
              measureArea:true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Draw a fire boundary on map ",
                        "Hold down the 'SHIFT' key during drawing to enable freehand mode. "
                    ]
                }
              ]
            },
            self.annotations.ui.defaultText,
            {
              name: 'Division',
              icon: 'dist/static/symbols/fire/division.svg',
              tints: self.tints,
              perpendicular: true,
              interactions: [self.annotations.pointDrawFactory(), self.annotations.snapToLineFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              selectedTint: 'selectedDivision',
              scope:["annotation"],
              showName: true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Place a 'Division' in map."
                    ]
                }
              ]
            }, {
              name: 'Sector',
              icon: 'dist/static/symbols/fire/sector.svg',
              tints: self.tints,
              perpendicular: true,
              interactions: [self.annotations.pointDrawFactory(), self.annotations.snapToLineFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              selectedTint: 'selectedDivision',
              scope:["annotation"],
              showName: true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Place a 'Sector' in map."
                    ]
                }
              ]
            },{
            /*  name: 'Hot Spot',
              icon: 'fa-circle red',
              interactions: [hotSpotDraw],
              style: hotSpotStyle,
              showName: true
            }, {*/
              name: 'Origin Point',
              icon: 'dist/static/symbols/fire/origin.svg',
              tints: self.tints,
              interactions: [self.annotations.pointDrawFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              selectedTint: 'selectedPoint',
              scope:["annotation"],
              showName: true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Place a 'Origin Point' in map."
                    ]
                }
              ]
            }, {
              name: 'Spot Fire',
              icon: 'dist/static/symbols/fire/spotfire.svg',
              tints: self.tints,
              interactions: [self.annotations.pointDrawFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              selectedTint: 'selectedPoint',
              scope:["annotation"],
              showName: true,
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Place a 'Spot Fire' in map."
                    ]
                }
              ]
            }, {
              name: 'Road Closure',
              icon: 'dist/static/symbols/fire/road_closure_point.svg',
              tints: self.tints,
              interactions: [self.annotations.pointDrawFactory()],
              style: self.annotations.getIconStyleFunction(self.tints),
              sketchStyle: self.annotations.getIconStyleFunction(self.tints),
              showName: true,
              selectedTint: 'selectedRoadClosurePoint',
              scope:["annotation"],
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Draw a 'Road Closure' on map ",
                        "Hold down the 'SHIFT' key during drawing to enable freehand mode. "
                    ]
                }
              ]
            }, {
              name: 'Control Line',
              icon: 'dist/static/symbols/fire/controlline.svg',
              interactions: [self.annotations.linestringDrawFactory()],
              size: 1,
              typeIcon: 'dist/static/symbols/fire/plus.svg',
              typeIconSelectedTint: 'selectedPlusIcon',
              typeIconDims: [20,20],
              colour: 'rgba(0, 0, 0, 0.1)',
              showName: true,
              scope:["annotation"],
              style: self.annotations.getVectorStyleFunc(this.tints),
              comments:[
                {
                    name:"Tips",
                    description:[
                        "Draw a 'Control Line' on map ",
                        "Hold down the 'SHIFT' key during drawing to enable freehand mode. "
                    ]
                }
              ]
            },
            self.annotations.ui.defaultLine,
            self.annotations.ui.defaultPolygon,
            self.annotations.ui.defaultPoint
          ]
    
          sssTools.forEach(function (tool) {
            self.annotations.tools.push(tool)
          })
    
          self.loading.app.phaseEnd("initialize")
    
          // load map without layers
          self.loading.app.phaseBegin("init_olmap",10,"Initialize olmap")
          self.map.init()
          self.loading.app.phaseEnd("init_olmap")
    
          self.loading.app.phaseBegin("load_catalogue",20,"Load catalogue",true,true)
          try {
              self.catalogue.loadRemoteCatalogue( function () {
                //add default layers
                var failed_phase = null
                try {
                    self.loading.app.phaseEnd("load_catalogue")
    
                    self.loading.app.phaseBegin("init_map_layers",10,"Initialize map layers")
                    failed_phase = "init_map_layers"
                    self.map.initLayers(self.store.activeLayers)
                    self.loading.app.phaseEnd("init_map_layers")
    
                    // tell other components map is ready
                    self.loading.app.phaseBegin("gk-init",15,"Broadcast 'go-init' event")
                    failed_phase = "gk-init"
                    self.$broadcast('gk-init')
                    self.loading.app.phaseEnd("gk-init")
    
                    // after catalogue load trigger a tour
                    self.loading.app.phaseBegin("gk-postinit",15,"Broadcast 'go-init' event")
                    failed_phase = "gk-postinit"
                    self.$broadcast('gk-postinit')
                    self.loading.app.phaseEnd("gk-postinit")
    
                    self.loading.app.phaseBegin("post_init",10,"Post initialization")
                    failed_phase = "post-init"
                    self.store.layout.screenHeight = $(window).height()
                    self.store.layout.screenWidth = $(window).width()
                    $(window).resize(debounce(function(){
                        if ($(window).height() !== self.store.layout.screenHeight) {
                            self.store.layout.screenHeight = $(window).height()
                        }
                        if ($(window).width() !== self.store.layout.screenWidth) {
                            self.store.layout.screenWidth = $(window).width()
                        }
                    },200))
                    $("#menu-tab-layers-label").trigger("click")
                    self.store.activeMenu = "layers"
                    self.layers.setup()
                    $("#layers-active-label").trigger("click")
                    self.store.activeSubmenu = "active"
                    self.active.setup()
    
                    self.loading.app.phaseEnd("post_init")
                } catch(err) {
                    //some exception happens
                    self.loading.app.phaseFailed(failed_phase,err)
                    throw err
                }
                if (self.store.settings.tourVersion !== tour.version) {
                  self.takeTour()
                }
              },function(reason){
                self.loading.app.phaseEnd("load_catalogue")
                alert(reason)
              })
          } catch(err) {
              //some exception happens
              self.loading.app.failed(err)
              throw err
          }
        }
      })
    })
}
