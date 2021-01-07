<template>
  <div class="map" id="map" tabindex="0">
    <gk-info v-ref:info></gk-info>
  </div>
  <gk-scales v-ref:scales></gk-scales>
  <gk-search v-ref:search></gk-search>
  <gk-featuredetail v-ref:featuredetail></gk-featuredetail>
  <gk-measure v-ref:measure></gk-measure>
  <gk-weatherforecast v-ref:weatherforecast></gk-weatherforecast>
  <gk-toolbox v-ref:toolbox></gk-toolbox>
</template>
<style>
    .ol-custom-overviewmap,
    .ol-custom-overviewmap.ol-uncollapsible {
        bottom: 0;
        left: auto;
        right: 0;
        top: auto;
    }

    .ol-custom-overviewmap:not(.ol-collapsed)  {
       border: 1px solid black;
    }

    .ol-custom-overviewmap .ol-overviewmap-map {
        border: none;
        width: 300px;
        height:150px;
    }

    .ol-custom-overviewmap .ol-overviewmap-box {
        border: 2px solid red;
    }

    .ol-custom-overviewmap:not(.ol-collapsed) button{
        bottom: auto;
        left: auto;
        right: 1px;
        top: 1px;
    }

</style>

<script>
  import { $, ol, proj4, moment,interact,turf } from 'src/vendor.js'
  import gkInfo from './info.vue'
  import gkScales from './scales.vue'
  import gkSearch from './search.vue'
  import gkFeaturedetail from './featuredetail.vue'
  import gkMeasure from './measure.vue'
  import gkWeatherforecast from './weatherforecast.vue'
  import gkToolbox from './toolbox.vue'
  export default {
    store: {
        fixedScales:'fixedScales', 
        resolutions:'resolutions', 
        matrixSets:'matrixSets', 
        dpmm:'dpmm', 
        view:'view',
        displayGraticule:'settings.graticule',
        displayResolution:'displayResolution'
    },
    components: { gkInfo, gkScales, gkSearch, gkMeasure,gkFeaturedetail,gkWeatherforecast,gkToolbox},
    data: function () {
      return {
        scale: 0,
        mapControls:{},
        graticule: new ol.LabelGraticule(),
        dragPanInter: new ol.interaction.DragPan({
          condition: function (mapBrowserEvent) {
            if (mapBrowserEvent.pointerEvent && (mapBrowserEvent.pointerEvent.button === 1)) {
              return false
            }
            return ol.events.condition.noModifierKeys(mapBrowserEvent)
          }
        }),
        doubleClickZoomInter: new ol.interaction.DoubleClickZoom(),
        keyboardPanInter: new ol.interaction.KeyboardPan(),
        keyboardZoomInter: new ol.interaction.KeyboardZoom(),
        middleDragPanInter: new ol.interaction.DragPan({
          condition: function (mapBrowserEvent) {
            if (mapBrowserEvent.pointerEvent && (mapBrowserEvent.pointerEvent.button === 1)) {
              mapBrowserEvent.preventDefault()
              return true
            }
            return false
          }
        })
      }
    },
    // parts of the template to be computed live
    computed: {
      loading: function () { return this.$root.loading },
      catalogue: function () { return this.$root.catalogue },
      env: function () { return this.$root.env },
      annotations: function () { return this.$root.annotations    },
      active: function () { return this.$root.active    },
      measure: function () { return this.$root.measure    },
      // because the viewport size changes when the tab pane opens, don't cache the map width and height
      width: {
        cache: false,
        get: function get () {
          return $("#map").width()
        }
      },
      height: {
        cache: false,
        get: function get () {
          return $("#map").height()
        }
      },
      extent: function() {
        return this.olmap.getView().calculateExtent(this.olmap.getSize())
      },
      resolution:function() {
        return this.olmap.getView().getResolution()
      }
    },
    watch: {
      displayGraticule:function(newValue,oldValue) {
        this.showGraticule(newValue)
      }
    },
    // methods callable from inside the template
    methods: {
      createEvent:function(source,type,options) {
        try {
            return new this._event(type,options)
        } catch(ex) {
            this._event = function(type,options) {
                ol.events.Event.call(this,type)
                var ev = this
                if (options) {
                    $.each(options,function(k,v){
                        ev[k] = v
                    })
                }
            }
            ol.inherits(this._event,ol.events.Event)
            return new this._event(type,options)
        }
      },
      clearFeatureProperties:function(feature){
          $.each(feature.getKeys(),function(index,key){
              if (key !== feature.getGeometryName()) {
                  feature.unset(key)
              }
          })
      },
      cloneFeature:function(feat,cloneGeometry,excludedProperties) {
        if (cloneGeometry === false) {
            var feature = new ol.Feature()
            $.each(feat.getProperties(),function(key,value){
                if (key === feat.getGeometryName()) {
                    return
                }
                if (excludedProperties && excludedProperties.indexOf(key) >= 0) {
                    return
                }
                feature.set(key,value,true)
            })
            return feature
        } else {
            var feature = feat.clone()
            if (excludedProperties) {
                $.each(excludedProperties,function(index,p){feature.unset(p,true)})
            }
            return feature
        }
      },
      isGeometryEqual:function(geom1,geom2,epsilon){
        epsilon = (epsilon === null || epsilon === undefined)?false:epsilon
        var initGeom = function(geom) {
            var geometries = null
            if (geom instanceof ol.geom.GeometryCollection) {
                geometries = geom.getGeometriesArray()
            } else if (geom instanceof ol.geom.MultiPolygon ) {
                geometries = geom.getPolygons()
            } else if (geom instanceof ol.geom.MultiPoint ) {
                geometries = geom.getPolygons()
            } else if (geom instanceof ol.geom.MultiLineString ) {
                geometries = geom.getLineStrings()
            } else if (geom instanceof ol.geom.Polygon ) {
                geometries = geom.getLinearRings()
            } else {
                return geom
            }
            if (geometries.length === 0) {
                return null
            } else if (geometries.length === 1) {
                return initGeom(geometries[0])
            } else {
                return geom
            }
        }
        var isCoordinateEqual = function(coords1,coords2) {
            if (epsilon) {
                return Math.abs(coords1[0] - coords2[0]) <= epsilon && Math.abs(coords1[1] - coords2[1]) <= epsilon
            } else {
                return coords1[0] === coords2[0] && coords1[1] === coords2[1]
            }
        }
        geom1 = initGeom(geom1)
        geom2 = initGeom(geom2)

        if ( !geom1 && !geom2 ) {
            return true
        } else if ( (geom1 && 1 || 0) + (geom2 && 1 || 0) === 1) {
            return false
        } else if (geom1 instanceof ol.geom.Point && geom2 instanceof ol.geom.Point) {
            return isCoordinateEqual(geom1.getCoordinates(),geom2.getCoordinates())
        } else if (geom1 instanceof ol.geom.LineString && geom2 instanceof ol.geom.LineString) {
            var coords1 = geom1.getCoordinates()
            var coords2 = geom2.getCoordinates()
            var len1 = coords1.length
            var len2 = coords2.length
            if (len1 !== len2) return false
            if (this.isGeometryEqual(coords1[0],coords1[len1 - 1])) {
                len1 = len1 - 1
            }
            if (this.isGeometryEqual(coords2[0],coords2[len1 - 1])) {
                len2 = len2 - 1
            }
            if (len1 !== len2) return false

            var baseIndex1 = 0
            var baseIndex2 = coords2.findIndex(function(c) { return isCoordinateEqual(c,coords1[baseIndex1])})
            if (baseIndex2 < 0) {return false}

            var equal = true
            for( i1 = baseIndex1 + 1,i2 = baseIndex2 + 1;i1 < len1;i1++,i2 = (i2 + 1) % len2) {
                if (!isCoordinateEqual(coords1[i1],coords2[i2])) {
                    if (i1 === baseIndex1 + 1) {
                        equal = false
                        break
                    } else {
                        return false
                    }
                }
            }
            if (!equal) {
                //check in reverse direction
                for( i1 = baseIndex1 + 1,i2 = (len2 + baseIndex2 - 1) % len2;i1 < len1;i1++,i2 = (len2 + i2 - 1) % len2) {
                    if (!isCoordinateEqual(coords1[i1],coords2[i2])) {
                        return false
                    }
                }
            }
            return true
        } else if (geom1 instanceof ol.geom.LinearRing && geom2 instanceof ol.geom.LinearRing) {
            var coords1 = geom1.getCoordinates()
            var coords2 = geom2.getCoordinates()
            var len1 = coords1.length - 1
            var len2 = coords2.length - 1
            if (len1 !== len2) return false

            var baseIndex1 = 0
            var baseIndex2 = coords2.findIndex(function(c) { return isCoordinateEqual(c,coords1[baseIndex1])})
            if (baseIndex2 < 0) {return false}

            var equal = true
            for( i1 = baseIndex1 + 1,i2 = baseIndex2 + 1;i1 < len1;i1++,i2 = (i2 + 1) % len2) {
                if (!isCoordinateEqual(coords1[i1],coords2[i2])) {
                    if (i1 === baseIndex1 + 1) {
                        equal = false
                        break
                    } else {
                        return false
                    }
                }
            }
            if (!equal) {
                //check in reverse direction
                for( i1 = baseIndex1 + 1,i2 = (len2 + baseIndex2 - 1) % len2;i1 < len1;i1++,i2 = (len2 + i2 - 1) % len2) {
                    if (!isCoordinateEqual(coords1[i1],coords2[i2])) {
                        return false
                    }
                }
            }
            return true
        } else if(geom1 instanceof ol.geom.Polygon && geom2 instanceof ol.geom.Polygon) {
            var vm = this
            var rings1 = geom1.getLinearRings()
            var rings2 = geom2.getLinearRings()
            if (rings1.length != rings2.length) {return false}
            var foundIndexes = []
            for(i = 0;i < rings1.length;i++) {
                if (!rings2.find(function(r2,index) {
                    if (foundIndexes.indexOf(index) >= 0) {
                        return false
                    } else if(vm.isGeometryEqual(r2,rings1[i])) {
                        foundIndexes.push(index)
                        return true
                    } else {
                        return false
                    }
                })) {
                    return false
                }
            }
            return true
        } else if(geom1 instanceof ol.geom.MultiLineString && geom2 instanceof ol.geom.MultiLineString) {
            var vm = this
            var lines1 = geom1.getLineStrings()
            var lines2 = geom2.getLineStrings()
            if (lines1.length != lines2.length) {return false}
            var foundIndexes = []
            for(i = 0;i < lines1.length;i++) {
                if (!lines2.find(function(l2,index) {
                    if (foundIndexes.indexOf(index) >= 0) {
                        return false
                    } else if(vm.isGeometryEqual(l2,lines1[i])) {
                        foundIndexes.push(index)
                        return true
                    } else {
                        return false
                    }
                })) {
                    return false
                }
            }
            return true
        } else if(geom1 instanceof ol.geom.MultiPolygon && geom2 instanceof ol.geom.MultiPolygon) {
            var vm = this
            var polygons1 = geom1.getPolygons()
            var polygons2 = geom2.getPolygons()
            if (polygons1.length != polygons2.length) {return false}
            var foundIndexes = []
            for(i = 0;i < polygons1.length;i++) {
                if (!polygons2.find(function(p2,index) {
                    if (foundIndexes.indexOf(index) >= 0) {
                        return false
                    } else if(vm.isGeometryEqual(p2,polygons1[i])) {
                        foundIndexes.push(index)
                        return true
                    } else {
                        return false
                    }
                })) {
                    return false
                }
            }
            return true
        } else if(geom1 instanceof ol.geom.GeometryCollection && geom2 instanceof ol.geom.GeometryCollection) {
            var vm = this
            var geometries1 = geom1.getGeometriesArray()
            var geometries2 = geom2.getGeometriesArray()
            if (geometries1.length != geometries2.length) {return false}
            var foundIndexes = []
            for(i = 0;i < geometries1.length;i++) {
                if (!geometries2.find(function(p2,index) {
                    if (foundIndexes.indexOf(index) >= 0) {
                        return false
                    } else if(vm.isGeometryEqual(p2,geometries1[i])) {
                        foundIndexes.push(index)
                        return true
                    } else {
                        return false
                    }
                })) {
                    return false
                }
            }
            return true
        }
        return false
      },
      showGraticule: function (show) {
        this.graticule.setMap(show?this.olmap:null)
      },
      //enable or disable a control
      getControl:function(controlName) {
        var control = this.mapControls[controlName]
        return control?control.controls:undefined
      },
      isControlEnabled:function(controlName) {
        var control = this.mapControls[controlName]
        return control?control.enabled:undefined
      },
      enableControl:function(controlName,enable) {
        var vm = this
        var control = this.mapControls[controlName]
        if (!control || control.enabled === enable) {
            //already enabled or disabled
            return
        }
        if (control.controls) {
            if (control.preenable) {
                control.preenable.call(control,enable)
            }
            if (Array.isArray(control.controls)) {
                $.each(control.controls,function(index,c){
                    if (enable) {
                        vm.olmap.addControl(c)
                    } else {
                        vm.olmap.removeControl(c)
                    }
                })
            } else {
                if (enable) {
                    vm.olmap.addControl(control.controls)
                } else {
                    vm.olmap.removeControl(control.controls)
                }
            }
            if (control.postenable) {
                control.postenable.call(control,enable)
            }
        }
        control.enabled = enable
      },
      tintSVG: function(svgstring, tints) {
        tints.forEach(function(colour) {
          svgstring = svgstring.split(colour[0]).join(colour[1])
        })
        return svgstring
      },
      //keys:[url,tint?,dims?]
      //if url is array, the blob is generated by drawing icon on the canvas one by one
      getBlob: function(feature, keys,tintSettings,callback) {
        // method to precache SVGs as raster (PNGs)
        // workaround for Firefox missing the SurfaceCache when blitting to canvas
        // returns a url or undefined if svg isn't baked yet
        var vm = this
        var tool = feature.get('toolName')?vm.annotations.getTool(feature.get('toolName')):{}
        var key = JSON.stringify(keys.map(function(k) {
          return vm.annotations.getStyleProperty(feature,k,'default',tool)
        }))
        if (this.svgBlobs[key]) {
          return this.svgBlobs[key]
        } else if (this.jobs[key]) {
          vm.jobs[key].then(function(){
                feature.changed()
                if (callback) {callback()}
          })
        } else {
          var dimsKey = (keys.length >= 3)?keys[2]:'dims'
          var tintKey = (keys.length >= 2)?keys[1]:'tint'

          var dims = tool[dimsKey] || [48, 48]
          var tint = vm.annotations.getStyleProperty(feature,tintKey,'default',tool)
          if (!Array.isArray(tint)) {
              //tint is a named tint,get the tint setting from tints object
              tint = (tintSettings && tintSettings[tint])?tintSettings[tint]:[]
          }
          var url = vm.annotations.getStyleProperty(feature,keys[0],null,tool)
          if (typeof tint === "string") {
            //tint is not just a color replacement, is a totally different icon;
            //will have some issue if url is a array .
            url = tint
            tint = []
          }
          vm.jobs[key] = new Promise(function(resolve, reject) {
            vm.addSVG(key, url, tint, dims, resolve)
            //console.log("getBlob " + key)
          }).then(function() {
            feature.changed()
            delete vm.jobs[key]
            if (callback) {callback()}
          })
        }


      },
      //url can be array of url
      addSVG: function(key, url, tint, dims, pResolve) {
        if (!this._addSVG) {
            this._addSVG = function(vm,key,url,tint,dims,pResolve){
                this.key = key
                this.url = url
                this.tint = tint || []
                this.dims = dims
                this.pResolve = pResolve
                this.svgToAdd = (Array.isArray(this.url))?this.url.length:1
                this.vm = vm
            }

            this._addSVG.prototype.draw = function() {
                if (this.svgToAdd === 0) return
                if (Array.isArray(this.url)) {
                    for(var i = 0;i < this.url.length;i++) {
                        this._load(this.url[i])
                    }
                } else {
                    this._load(this.url)
                }
            }
            this._addSVG.prototype._draw = function() {
              this.svgToAdd -= 1
              if (this.svgToAdd > 0) return
              if (typeof this.vm.svgBlobs[this.key] !== 'undefined') { this.pResolve() }
              // RACE CONDITION: MS edge inlines promises and callbacks!
              // we can't set vm.svgBlobs[this.key] to be the Promise, as
              // it's entirely possible for the whole thing to have been 
              // completed in the constructor before the svgBlobs array is even set
              //vm.svgBlobs[this.key] = ''
              //console.log("_addSVG._draw " + this.key + "\t" + this.svgToAdd + ": " + this.url)
              var self = this
              var drawJob = new Promise(function(resolve, reject) {
                if (Array.isArray(self.url)) {
                    self.vm.drawSVG(self.key, self.url.map(function(u) {return self.vm.svgTemplates[u]}), self.tint,self.dims, resolve, reject)
                } else {
                    self.vm.drawSVG(self.key, self.vm.svgTemplates[self.url], self.tint, self.dims, resolve, reject)
                }
              }).then(function() {
                self.pResolve()
              })
            }
            this._addSVG.prototype._load = function(svgUrl) {
                var self = this
                if (self.vm.svgTemplates[svgUrl]) {
                  // render from loaded svg or queue render post load promise
                  self._draw()
                } else if (self.vm.jobs[svgUrl]) {
                  self.vm.jobs[svgUrl].then(function(){
                      self._draw()
                  })
                } else {
                  self.vm.jobs[svgUrl] = new Promise(function (resolve, reject) { 
                    // load svg
                    //console.log('addSVG: Cache miss for '+ self.key)
                    var req = new window.XMLHttpRequest()
                    req.withCredentials = true
                    req.onload = function () {
                      if (!this.responseText) {
                        return
                      }
                      //console.log('addSVG: XHR returned for '+key)
                      self.vm.svgTemplates[svgUrl] = this.responseText
                      resolve()
                    }
                    req.onerror = function() {
                      reject()
                    }
                    req.open('GET', svgUrl)
                    req.send()
                  }).then(function(){
                    self._draw()
                    delete self.vm.jobs[svgUrl]
                  })
                }
            }
        }
        new this._addSVG(this,key, url, tint, dims, pResolve).draw()
      },
      drawSVG: function(key, svgstring, tints, dims, resolve, reject) {
        //console.log('drawSVG: Cache miss for '+key)
        if (!this._drawSVG) {
            this._drawSVG = function(vm,key, svgstring, tints, dims, resolve, reject) {
                this.key = key
                this.svgstring = svgstring
                this.tints = tints
                this.dims = dims
                this.resolve = resolve
                this.reject = reject
                this.imagesToDraw = (Array.isArray(this.svgstring))?this.svgstring.length:1
                this.vm = vm
            }
            this._drawSVG.prototype.draw = function() {
                var canvas = $('<canvas>')
                canvas.attr({width: this.dims[0], height: this.dims[1]})
                if (this.imagesToDraw === 0) return
                if (Array.isArray(this.svgstring)) {
                    for(var i = 0;i < this.svgstring.length;i++) {
                        this._drawImage(canvas,this.svgstring[i])
                    }
                } else {
                    this._drawImage(canvas,this.svgstring)
                }
            }
            this._drawSVG.prototype._drawImage = function(canvas,svgstr) {
                var self = this
                canvas.drawImage({
                  source: 'data:image/svg+xml;utf8,' + encodeURIComponent(self.vm.tintSVG(svgstr, self.tints)),
                  fromCenter: false, x: 0, y: 0, width: self.dims[0], height: self.dims[1],
                  load: function () {
                    //console.log('drawSVG: Canvas drawn for '+ self.key)
                    self.imagesToDraw -= 1
                    if (self.imagesToDraw === 0) {
                        canvas.get(0).toBlob(function (blob) {
                          self.vm.svgBlobs[self.key] = window.URL.createObjectURL(blob)
                          //console.log("_drawSVG._drawImage svgBlobs : "  + self.key )
                          self.resolve()
                        }, 'image/png')
                        canvas = null
                    }
                  }
                })
            }
        }

        new this._drawSVG(this,key, svgstring, tints, dims, resolve, reject).draw()
      },
      //always using style array to simplify the logic
      cacheStyle: function(styleFunc, feature, keys,sufix) {
        var vm = this
        if (feature) {
            var key = keys.map(function(k) {
              return vm.annotations.getStyleProperty(feature,k,'default')
            }).join(";")
            key = sufix?(key + ";" + sufix):key
            var style = this.cachedStyles[key]
            if (style) { 
                return style 
            }
            style = styleFunc(feature)
            if (style) {
              style = (Array.isArray(style))?style:[style]
              this.cachedStyles[key] = style
              return style
            }
        }
        return new ol.layer.Vector().getStyleFunction()()
      },
      animate: function (args) {
        // pan from the current center
        this.olmap.getView().animate.apply(this.olmap.getView(),arguments)
      },
      // force OL to approximate a fixed scale (1:1K increments)
      setScale: function (scale) {
        while (Math.abs(this.getScale() - scale) > 0.001) {
          this.olmap.getView().setResolution(this.olmap.getView().getResolution() * scale / this.getScale())
        }
        this.scale = scale
      },
      // return the scale (1:1K increments)
      getScale: function () {
        var size = this.olmap.getSize()
        var center = this.getCenter()
        var extent = this.olmap.getView().calculateExtent(size)
        var distance = this.$root.wgs84Sphere.haversineDistance([extent[0], center[1]], center) * 2
        return distance * this.dpmm / size[0]
      },
      // get the fixed scale (1:1K increments) closest to specified or the current scale
      getFixedScale: function (scale) {
        scale = scale || this.getScale()
        var closest = null
        $.each(this.fixedScales, function () {
          if (closest === null || Math.abs(this - scale) < Math.abs(closest - scale)) {
            closest = this
          }
        })
        return closest
      },
      // generate a human-readable scale string
      getScaleString: function (scale) {
        if (Math.round(scale * 100) / 100 < 10.0) {
          return '1:' + (Math.round(scale * 1000)).toLocaleString()
        } else if (Math.round(scale * 100) / 100 >= 1000.0) {
          return '1:' + (Math.round(scale / 1000)).toLocaleString() + ' M'
        }
        return '1:' + (Math.round(scale)).toLocaleString() + ' K'
      },
      // get the decimal degrees representation of some EPSG:4326 coordinates
      getDeg: function(coords) {
        return coords[0].toFixed(5)+', '+coords[1].toFixed(5)
      },
      // get the DMS representation of some EPSG:4326 coordinates
      getDMS: function(coords) {
        return ol.coordinate.degreesToStringHDMS_(coords[0], 'EW', 1) + ', ' +
               ol.coordinate.degreesToStringHDMS_(coords[1], 'NS', 1)
      },
      // get the MGA representation of some EPSG:4326 coordinates
      getMGA: function(coords) {
        var mga = this.getMGARaw(coords)
        if (mga) {
            return 'MGA '+mga.mgaZone+' '+Math.round(mga.mgaEast)+'E '+Math.round(mga.mgaNorth)+'N'
        }
        return ''
      },
      getMGARaw: function(coords) {
        var results = {}
        if ((coords[0] >= 108) && (coords[0] < 114)) {
          results.mgaZone = 49
        } else if ((coords[0] >= 114) && (coords[0] < 120)) {
          results.mgaZone = 50
        } else if ((coords[0] >= 120) && (coords[0] < 126)) {
          results.mgaZone = 51
        } else if ((coords[0] >= 126) && (coords[0] < 132)) {
          results.mgaZone = 52
        } else if ((coords[0] >= 132) && (coords[0] < 138)) {
          results.mgaZone = 53
        } else if ((coords[0] >= 138) && (coords[0] < 144)) {
          results.mgaZone = 54
        } else if ((coords[0] >= 144) && (coords[0] < 150)) {
          results.mgaZone = 55
        } else if ((coords[0] >= 150) && (coords[0] < 156)) {
          results.mgaZone = 56
        } else {
          // fail if not in the bounding box for MGA
          return null
        }
        var newCoords = proj4('EPSG:4326', 'EPSG:283'+results.mgaZone).forward(coords)
        results.mgaEast = newCoords[0]
        results.mgaNorth = newCoords[1]
        return results
      },
      // parse a string containing coordinates in decimal or DMS format
      parseDMSString: function(dmsStr) {
        // https://regex101.com/r/kS2zR1/22
        var dmsRegex = /^\s*(-)?(\d+(?:\.\d+)?)[°º:d\s]?\s*(?:(\d+(?:\.\d+)?)['’‘′:m]\s*(?:(\d{1,2}(?:\.\d+)?)(?:"|″|’’|''|s)?)?)?\s*([NSEW])?[,:\s]+(-)?(\d+(?:\.\d+)?)[°º:d\s]?\s?(?:(\d+(?:\.\d+)?)['’‘′:m]\s*(?:(\d{1,2}(?:\.\d+)?)(?:"|″|’’|''|s)?)?)?\s*([NSEW])?$/gmi
        
        var groups = dmsRegex.exec(dmsStr)

        if (!groups) {
          return null
        }

        var dmsToDecimal = function(sign, deg, min, sec, dir) {
          var sg = sign ? -1 : 1
          sg = sg * (('wWsS'.indexOf(dir) >= 0) ? -1 : 1)
          var d = Number(deg)
          var m = min ? Number(min) : 0
          var s = sec ? Number(sec) : 0
          if (!(d >= 0 && d <= 180)) return null
          if (!(m >= 0 && m <= 60)) return null
          if (!(s >= 0 && s <= 60)) return null
          return sg*(d+(m/60)+(s/3600))
        }

        var coords = [
          dmsToDecimal(groups[1], groups[2], groups[3], groups[4], groups[5]),
          dmsToDecimal(groups[6], groups[7], groups[8], groups[9], groups[10])
        ]

        if ((!coords[0]) || (!coords[1])) {
          // one coordinate fails the sniff test
          return null
        } else if ((coords[0] < -90 || coords[0] > 90) && (coords[1] < -90 || coords[1] > 90)) {
          //coordinate is invalid
          return null
        } else if (coords[0] < -180 || coords[0] > 180 || coords[1] < -180 || coords[1] > 180) {
          return null
        }
        //try to guess the coordinate's order to fix some obvious input error
        if (coords[0] < -90 || coords[0] > 90) {
            // the first value is less than -90 or larger than 90, don't change the order
        } else if(coords[1] < -90 || coords[1] > 90) {
            // the second value is less than -90 or larger than 90, reverse the order
            coords = coords.reverse()
        } else if (!groups[5] && !groups[10]) {
            // no one is explicitly defined, 
            // reverse the order because most people use is northing, easting (opposite of EPSG:4326)
            coords = coords.reverse()
        } else if (!groups[5] || !groups[10]) {
            // if only one is explicitly defined, swap if required
            if (groups[5] && ('nNsS'.indexOf(groups[5]) >=0)) {
                coords = coords.reverse()
            } else if (groups[10] && ('wWeE'.indexOf(groups[10]) >=0)) {
              coords = coords.reverse()
            }
        } else {
            // both are explicitly defined
            // bomb out if someone describes two of the same
            if (('nNsS'.indexOf(groups[5]) >=0) && ('nNsS'.indexOf(groups[10]) >=0)) {
                return null
            } else if (('wWeE'.indexOf(groups[5]) >=0) && ('wWeE'.indexOf(groups[10]) >=0)) {
                return null
            }
            // swap if defined around the other way
            if (('nNsS'.indexOf(groups[5]) >=0) && ('wWeE'.indexOf(groups[10]) >=0)) {
                coords = coords.reverse()
            }
        }
        return coords 
      },
      // parse a string containing coordinates in MGA grid reference format
      // e.g. MGA 51 340000 6340000, MGA 51 340000mE 6340000mN, MGA 51 3406340
      parseMGAString: function(mgaStr) {
        // https://regex101.com/r/zY8dW4/2
        var mgaRegex = /(?:MGA|mga)\s*(49|50|51|52|53|54|55|56)\s*(\d{3,7})\s*[mM]{0,1}\s*([nNeE]{0,1})\s*,*\s*(\d{4,7})\s*[mM]{0,1}\s*([nNeE]{0,1})/gi
        var groups = mgaRegex.exec(mgaStr)
        
        if (!groups) {
          return null
        }

        var results = {
          mgaZone: parseInt(groups[1]),
          mgaEast: groups[2],
          mgaNorth: groups[4],
        }
        if ((groups[5] === "E") && (groups[3] === "N")) {
          results.mgaEast = groups[4]
          results.mgaNorth = groups[2]
        }
        if ((results.mgaEast.length === 3) && (results.mgaNorth.length === 4)) {
          results.mgaEast = results.mgaEast + '000'
          results.mgaNorth = results.mgaNorth + '000'
        } else if ((results.mgaEast.length === 6) && (results.mgaNorth.length === 7)) {
          // full length MGA coords
        } else {
          return null  // invalid MGA length
        }
        results.mgaEast = parseInt(results.mgaEast)
        results.mgaNorth = parseInt(results.mgaNorth)

        var coords = proj4('EPSG:283'+groups[1], 'EPSG:4326').forward([results.mgaEast, results.mgaNorth])
        results.coords = coords
        
        return results
      },
      // parse a string containing a FD Grid reference
      parseGridString: function(fdStr) {
        var fdRegex = /(FD|fd|PIL|pil)\s*([a-zA-Z]{1,2})\s*([0-9]{1,5})/gi
        var groups = fdRegex.exec(fdStr)
        if (!groups) {
          return null
        }
        var results = {
          gridType: groups[1].toUpperCase(),
          gridNorth: groups[2].toUpperCase(),
          gridEast: groups[3]
        }
        return results
      },

      getCenter: function() {
        return this.olmap.getView().getCenter();
      },

      // reusable tile loader hook to update a loading indicator
      tileLoaderHook: function (tileSource, tileLayer) {
        // number of tiles currently in flight
        var numLoadingTiles = 0
        // number of misses for the current set
        var badTiles = 0
        var tileLoader = tileSource.getTileLoadFunction()
        return function (tile, src) {
          if (numLoadingTiles === 0) {
            tileLayer.progress = 'loading'
            badTiles = 0
          }
          numLoadingTiles++
          var image = tile.getImage()
          // to hell with you, cross origin policy!
          image.crossOrigin = 'use-credentials'
          image.onload = function () {
            numLoadingTiles--
            if (numLoadingTiles === 0) {
              if (badTiles > 0) {
                tileLayer.progress = 'error'
              } else {
                tileLayer.progress = 'idle'
              }
            }
          }
          image.onerror = function () {
            badTiles++
            image.onload()
          }
          tileLoader(tile, src)
        }
      },
      setUrlTimestamp:function(tileSource,time) {
        if (!tileSource.setUrlTimestamp) {
          tileSource.setUrlTimestamp = function() {
              var originFunc = tileSource.getTileUrlFunction()
              return function(time) {
                  tileSource.setTileUrlFunction(function(tileCoord,pixelRatio,projection){
                      return originFunc(tileCoord,pixelRatio,projection) + "&time=" + time
                  },tileSource.getUrls()[0] + "?time=" + time)
              }
          }()
        }
        tileSource.setUrlTimestamp(time)
      },
      refreshLayerTile : function (tileLayer) {
        var vm = this
        //for timeline layer, layer's source will be changed when change timeline index
        if (!tileLayer.getSource().load) {
          tileLayer.getSource().load = function() {
            //console.log(((tileLayer.getSource().getLayer)?tileLayer.getSource().getLayer():tileLayer.getSource().getUrls()[0]) + " : Start refresh tiles")
            tileLayer.set('updated', moment().toLocaleString())
            // changing a URL forces a fetch + redraw
            vm.setUrlTimestamp(tileLayer.getSource(),moment.utc().unix())
            // empty the tile cache so other zoom levels are also reloaded
            tileLayer.getSource().tileCache.clear()
            vm.$root.active.refreshRevision += 1
          }
        }
        tileLayer.getSource().load()
      },
      refreshTimelineFunc:function(layer,postFetchTimelineFunc) {
        var vm = this
        var _func = null
        //return the refresh time, if need refresh,otherwise return null
        var _getRefreshTime = function() {
            if (!layer.lastTimelineRefreshTime) {
                return moment.tz("Australia/Perth")
            } else if ( moment.tz("Australia/Perth") - layer.lastTimelineRefreshTime > layer.timelineRefresh * 1000) {
                return moment.tz("Australia/Perth")
            } else {
                return null
            }
        }
        var _getNextRefreshTime = function() {
            var nextTime = null;
            if (!layer.lastTimelineRefreshTime) {
                nextTime = moment.tz("Australia/Perth")
            } else if ( moment.tz("Australia/Perth") - layer.lastTimelineRefreshTime > layer.timelineRefresh * 1000) {
                nextTime = moment.tz("Australia/Perth")
            } else {
                nextTime = moment(layer.lastTimelineRefreshTime)
            }
            nextTime.seconds(nextTime.seconds() + layer.timelineRefresh )
            return nextTime
        }
        var _setTimeIndex = function(tileLayer,previousTimeline) {
            if (!layer.timeline) {
                return
            }
            var _func = function(layer,tileLayer,perviousTimeline) {
                var d = null
                if (previousTimeline && previousTimeline.length > 0 && tileLayer.get('timeIndex') && tileLayer.get('timeIndex') < previousTimeline.length && tileLayer.get('timeIndex') >= 0) {
                    d = moment.fromLocaleString(previousTimeline[tileLayer.get('timeIndex')][0])
                } else {
                    d = moment.tz("Australia/Perth")
                }
                var timddiff = 0
                var timeIndex = null
                $.each(layer.timeline,function(index,timelineLayer) {
                    timediff = d - moment.fromLocaleString(timelineLayer[0])
                    if (timediff < 0) {
                        timeIndex = (index == 0)?0:index - 1
                        return false
                    } else if (timediff === 0) {
                        timeIndex = index
                        return false
                    }
                })
                timeIndex = (timeIndex == null)?(layer.timeline.length - 1):timeIndex
                tileLayer.set('timeIndex',timeIndex)
            }
            if (layer.setTimeIndex) {
                layer.setTimeIndex(layer,tileLayer,previousTimeline,_func)
            } else {
                _func(layer,tileLayer,previousTimeline)
            }
        }
        var _fetchTimelineFailed = function(layer,tileLayer,auto,status,statusText){
            if (!layer.previewLayer && vm.getMapLayer(layer) !== tileLayer) {
                //console.log(moment().toLocaleString() + " : " + tileLayer.autoTimelineRefresh + " - Stop run because " + layer.name + " is removed from map" )
                return
            }
            if (!tileLayer.get("timeIndex")) { _setTimeIndex(tileLayer)}
            if (layer.previewLayer) {return}
            tileLayer.progress = "error"
            tileLayer.set('updated',layer.lastUpdatetime + "\r\n" + status + " : " + statusText)
            vm.active.refreshRevision += 1
            //console.warn(moment().toLocaleString() + " : Update the timeline of " + layer.name + " failed. code = " + status + ", reason = " + statusText )
            if (!auto) {return}
            var waitTimes = _getNextRefreshTime() - moment()
            tileLayer.autoTimelineRefresh = setTimeout(function(){_func(true)},waitTimes)
            //console.log(moment().toLocaleString() + " : " + tileLayer.autoTimelineRefresh + " - Next timeline refresh time for " + layer.name + " is " + waitTimes + " milliseconds later" )
        }
        var _timelineNotChanged = function(layer,tileLayer,auto){
            if (!layer.previewLayer && vm.getMapLayer(layer) !== tileLayer) {
                //console.log(moment().toLocaleString() + " : " + tileLayer.autoTimelineRefresh + " - Stop run because " + layer.name + " is removed from map" )
                return
            }
            if (!tileLayer.get("timeIndex")) { _setTimeIndex(tileLayer)}
            if (layer.previewLayer) {return}
            tileLayer.progress = ""
            tileLayer.set('updated',layer.lastUpdatetime )
            vm.active.refreshRevision += 1
            if (!auto) {return}
            var waitTimes = _getNextRefreshTime() - moment()
            tileLayer.autoTimelineRefresh = setTimeout(function(){_func(true)},waitTimes)
            //console.log(moment().toLocaleString() + " : " + tileLayer.autoTimelineRefresh + " - Next timeline refresh time for " + layer.name + " is " + waitTimes + " milliseconds later" )
        }
        var _processTimeline = function(layer,tileLayer,auto,timeline){
            if (!layer.previewLayer && vm.getMapLayer(layer) !== tileLayer) {
                //console.log(moment().toLocaleString() + " : " + tileLayer.autoTimelineRefresh + " - Stop run because " + layer.name + " is removed from map" )
                return
            }
            tileLayer.progress = ""
            if (postFetchTimelineFunc) {
                postFetchTimelineFunc(layer,tileLayer,timeline)
            }
            var previousTimeline = layer.timeline
            layer.timeline = timeline.layers

            //get new time index for current displayed timeline layer
            _setTimeIndex(tileLayer,previousTimeline)

            tileLayer.set('updated',layer.lastUpdatetime)
            vm.active.refreshRevision += 1

            if (layer.previewLayer) {return}
            if (!auto) {return}
            var waitTimes = _getNextRefreshTime() - moment()
            tileLayer.autoTimelineRefresh = setTimeout(function(){_func(true)},waitTimes)
            //console.log(moment().toLocaleString() + " : " + tileLayer.autoTimelineRefresh + " - Next timeline refresh time for " + layer.name + " is " + waitTimes + " milliseconds later" )
        }

        _func = function(auto) {
            var tileLayer = layer.mapLayer
            //console.log(moment().toLocaleString() + " : " + tileLayer.autoTimelineRefresh + " - Begin to refresh the timeline of " + layer.name)
            if (!tileLayer) throw "Maplayer is null."
            var currentRefreshTime = _getRefreshTime()
            if (currentRefreshTime === null) {
                if (!tileLayer.get("timeIndex")) { _setTimeIndex(tileLayer)}
                if (layer.previewLayer) {return}
                if (!auto) {return}
                var waitTimes = _getNextRefreshTime() - moment()
                tileLayer.autoTimelineRefresh = setTimeout(function(){_func(true)},waitTimes)
                //console.log(moment().toLocaleString() + " : " + tileLayer.autoTimelineRefresh + " - Next timeline refresh time for " + layer.name + " is " + waitTimes + " milliseconds later" )
            } else {
                //console.log(moment().toLocaleString() + " : refresh timeline " + layer.id + "'s timeline. ")
                var layerTime = moment(currentRefreshTime)
                var layerId = null
                layer.lastTimelineRefreshTime = currentRefreshTime
                tileLayer.progress = "loading"
                var timelineUrl = ""
                if (layer.fetchTimelineUrl.indexOf("?") >= 0) {
                    timelineUrl = layer.fetchTimelineUrl + "&updatetime=" +  (layer.lastUpdatetime || "")
                } else {
                    timelineUrl = layer.fetchTimelineUrl + "?updatetime=" +  (layer.lastUpdatetime || "")
                }
                $.ajax(timelineUrl ,{
                    xhrFields:{
                        withCredentials: true
                    },
                    dataType:"json",
                    success:function(data,status,jqXHR) {
                        if (jqXHR.status === 290) {
                            _timelineNotChanged(layer,tileLayer,auto)
                            return
                        }
                        layer.lastUpdatetime = data.updatetime
                        _processTimeline(layer,tileLayer,auto,data)
                    },
                    error:function(jqXHR) {
                        _fetchTimelineFailed(layer,tileLayer,auto,jqXHR.status,(jqXHR.responseText || jqXHR.statusText))
                    }
                })
            }

        }
        return _func
      },
      // loader for layers with a "time" axis, e.g. live satellite imagery
      createTileWMSLayer: function (layer) {
        if (layer.mapLayer) return layer.mapLayer
        var vm = this
        var matrixSet = this.matrixSets[layer.params.matrixSet]
        layer.params = $.extend({
          FORMAT: 'image/jpeg',
          SRS: matrixSet.srs
        }, layer.params || {})

        if (!layer.timelineRefresh || !layer.fetchTimelineUrl) {
            layer.params["layers"] = layer.layerid
        }

        // technically, we can specify a WMS source and a layer without
        // either the source URL or the layerID. which is good, because
        // we need to do that later on in a callback.
        var tileSource = new ol.source.TileWMS({
          params: layer.params,
          tileGrid: new ol.tilegrid.TileGrid({
            extent: matrixSet.extent,,
            resolutions: this.resolutions,
            tileSize: [matrixSet.tileSize, matrixSet.tileSize]
          })
        })

        var tileLayer = new ol.layer.Tile({
          opacity: layer.opacity || 1,
          source: tileSource
        })

        // hook the tile loading function to update progress indicator
        tileLayer.progress = ''
        tileSource.setTileLoadFunction(this.tileLoaderHook(tileSource, tileLayer))

        // hook to swap the tile layer when timeIndex changes
        tileLayer.on('propertychange', function (event) {
          if (event.key === 'timeIndex') {
            if (layer.timeline && layer.timeline.length > 0) {
                tileSource.updateParams({
                  'layers': getLayerId(layer.timeline[event.target.get(event.key)][1])
                })
            }
          }
        })

        if (!layer.refreshTimeline && layer.timelineRefresh && layer.fetchTimelineUrl) {
            layer.refreshTimeline = vm.refreshTimelineFunc(layer)
        }


        // set properties for use in layer selector
        tileLayer.set('name', layer.name)
        tileLayer.set('id', layer.mapLayerId)
        tileLayer.layer = layer
        layer.mapLayer = tileLayer

        tileLayer.refresh = function () {
            if (!layer.refreshTimeline) {
                this.set('updated', moment().toLocaleString())
                vm.$root.active.refreshRevision += 1
            }
        }

        tileLayer.stopAutoRefresh = function() {
            vm._stopAutoRefresh(this)
        }

        tileLayer.startAutoRefresh = function() {
            vm._startAutoRefresh(this)
        }

        // if the "refresh" option is set, set a timer
        // to update the source
        tileLayer.postAdd = function() {
            if (layer.refreshTimeline) {
                if (tileLayer.autoTimelineRefresh) {
                    clearInterval(tileLayer.autoTimelineRefresh)
                    tileLayer.autoTimelineRefresh = null
                }
                layer.refreshTimeline(true)
            }

            if (layer.refresh) {
              this.set('updated', moment().toLocaleString())
              vm.$root.active.refreshRevision += 1
            }
            this.startAutoRefresh()
        }
        tileLayer.postRemove = function () {
            vm._postRemove(this)
            if (this.autoTimelineRefresh) {
                clearInterval(this.autoTimelineRefresh)
                this.autoTimelineRefresh = null
            }
        }

        return tileLayer
      },
      // loader for vector layers with hover querying
      createWFSLayer: function (layer) {
        if (layer.mapLayer) return layer.mapLayer
        var vm = this

        layer.layerid = layer.layerid || getLayerId(layer.id)

        layer.params = $.extend({
          service: 'WFS',
          request: 'GetFeature',
          outputFormat: 'application/json',
          srsname: 'EPSG:4326',
        }, layer.params || {})

        if (layer.params.version == "2.0.0") {
            if (!layer.params.typeNames) {
                layer.params.typeNames = layer.layerid
            }
        } else {
            if (!layer.params.typeName) {
                layer.params.typeName = layer.layerid
            }
        }

        var vectorSource = new ol.source.Vector({
            features:layer.features || undefined
        })
        var vector = new ol.layer.Vector({
          opacity: layer.opacity || 1,
          source: vectorSource,
          style: layer.params.style
        })
        vector.progress = ''

        vectorSource.retrieveFeatures = function (filter,onSuccess,onError) {
          var params = $.extend({},layer.params)
          
          if (filter) {
            params.cql_filter = filter
          } else if (params.cql_filter) {
            delete params.cql_filter
          }
          $.ajax({
            url: layer.url + '?' + $.param(params),
            success: function (response, stat, xhr) {
              var features = vm.$root.geojson.readFeatures(response)
              onSuccess(features)
            },
            error: function () {
                if (onError) {
                    onError(status,message)
                }
            },
            dataType: 'json',
            xhrFields: {
              withCredentials: true
            }
          })
        }

        vectorSource.loadSource = function (loadType,onSuccess) {
          if (layer.cql_filter) {
            layer.params.cql_filter = layer.cql_filter
          } else if (layer.params.cql_filter) {
            delete layer.params.cql_filter
          }
          vm.$root.active.refreshRevision += 1
          vector.progress = 'loading'
          $.ajax({
            url: layer.url + '?' + $.param(layer.params),
            success: function (response, stat, xhr) {
              var features = vm.$root.geojson.readFeatures(response)
              var defaultOnload = function(loadType,source,features) {
                  source.clear(true)
                  source.addFeatures(features)
              }
              if (layer.onload) {
                layer.onload(loadType,vectorSource,features,defaultOnload)
              } else {
                defaultOnload(loadType,vectorSource,features)
              }
              vm.$root.active.refreshRevision += 1
              vector.progress = 'idle'
              if(layer.getUpdatedTime) {
                var time = layer.getUpdatedTime(features)
                if (time) {
                    vector.set('updated', time.toLocaleString())
                } else {
                    vector.set('updated', "")
                }
              } else {
                vector.set('updated', moment().toLocaleString())
              }
              vectorSource.dispatchEvent('loadsource')
              if (onSuccess) {
                onSuccess()
              }
            },
            error: function (jqXHR,status,message) {
              vm.$root.active.refreshRevision += 1
              vector.progress = 'error'
              if (layer.onerror) {
                layer.onerror(status,message)
              }
            },
            dataType: 'json',
            xhrFields: {
              withCredentials: true
            }
          })
        }

        if (layer.onadd) {
          vectorSource.on('addfeature', function (event) {
            layer.onadd(event.feature)
          })
        }
        
        vector.set('name', layer.name)
        vector.set('id', layer.mapLayerId)
        vector.layer = options
        layer.mapLayer = vector

        vector.stopAutoRefresh = function() {
            vm._stopAutoRefresh(this)
        }

        vector.refresh = function(type) {
            vectorSource.loadSource(type || "auto")
        }

        vector.startAutoRefresh = function() {
            vm._startAutoRefresh(this)
        }

        vector.postRemove = function () {
          vm._postRemove(this)
        }

        vector.postAdd = function() {
            // if the "refresh" option is set, set a timer
            // to update the source
            this.startAutoRefresh()
            // populate the source with data
            if (layer.initialLoad === undefined || layer.initialLoad === true) {
                vectorSource.loadSource("initial")
            }
        }

        return vector
      },
      createAnnotations: function (layer) {
        if (!(this.annotations.featureOverlay["layer"])) {
            this.annotations.featureOverlay.layer = layer
            layer.mapLayer = this.annotations.featureOverlay
        }
        return this.annotations.featureOverlay
      },
      // loader to create a WMTS layer from a kmi datasource
      createWMTSLayer: function (layer) {
        if (layer.mapLayer) return layer.mapLayer
        var vm = this
        layer.params = $.extend({
          opacity: 1,
          format: 'image/png',
          matrixSet:'gda94',
          style: ''
        }, options.params)

        // create a tile grid using the stock KMI resolutions
        var matrixSet = this.matrixSets[layer.params.matrixSet]
        var tileGrid = new ol.tilegrid.WMTS({
          origin: matrixSet.extent.getTopLeft([-180, -90, 180, 90]),
          resolutions: this.resolutions,
          matrixIds: matrixSet.matrixIds,
          tileSize: matrixSet.tileSize
        })

        // override getZForResolution on tile grid object;
        // for weird zoom levels, the default is to round up or down to the
        // nearest integer to determine which tiles to use.
        // because we want the printing rasters to contain as much detail as
        // possible, we rig it here to always round up.
        tileGrid.origGetZForResolution = tileGrid.getZForResolution
        tileGrid.getZForResolution = function (resolution, optDirection) {
          return tileGrid.origGetZForResolution(resolution*1.4, -1)
        }

        // create a tile source
        var tileSource = new ol.source.WMTS({
          url: layer.url,
          layer: layer.layerid,
          matrixSet: matrixSet.name,
          format: layer.params.format,
          style: layer.params.style,
          projection: matrixSet.srs,
          wrapX: true,
          tileGrid: tileGrid
        })

        var tileLayer = new ol.layer.Tile({
          opacity: layer.opacity || 1,
          source: tileSource
        })

        // hook the tile loading function to update progress indicator
        tileLayer.progress = ''

        // set properties for use in layer selector
        tileLayer.set('name', layer.name,false)
        tileLayer.set('id', layer.mapLayerId,false)
        tileLayer.layer = layer
        layer.mapLayer = tileLayer

        if (layer.lastUpdatetime) {
            tileLayer.set('updated',layer.lastUpdatetime)
        }

        // hook to swap the tile layer when timeIndex changes
        tileLayer.on('propertychange', function (event) {
          if (event.key === 'timeIndex') {
            if (layer.timeline && layer.timeline.length > 0) {
                if (!(layer.timeline[event.target.get(event.key)][2])) {
                    layer.timeline[event.target.get(event.key)][2] = new ol.source.WMTS({
                      url: layer.url,
                      layer: getLayerId(layer.timeline[event.target.get(event.key)][1]),
                      matrixSet: matrixSet.name,
                      format: layer.params.format,
                      style: layer.params.style,
                      projection: matrixSet.srs,
                      wrapX: true,
                      tileGrid: tileGrid
                    })
                    layer.timeline[event.target.get(event.key)][2].setTileLoadFunction(vm.tileLoaderHook(layer.timeline[event.target.get(event.key)][2], tileLayer))
                    vm.setUrlTimestamp(layer.timeline[event.target.get(event.key)][2],moment.utc().unix())
                }
                tileLayer.setSource(layer.timeline[event.target.get(event.key)][2] )

                if (layer.refresh && layer.autoRefreshStopped !== true ) {
                    tileLayer.stopAutoRefresh()
                    tileLayer.startAutoRefresh()
                }
            }
          }
        })

        if (!layer.refreshTimeline && layer.timelineRefresh && layer.fetchTimelineUrl) {
            layer.refreshTimeline = vm.refreshTimelineFunc(layer,function(layer,tileLayer,timeline){
                if (layer.timeline) {
                    //reuse already created tile source
                    $.each(timeline.layers,function(index,timelineLayer) {
                        if (layer.timeline.length > index && layer.timeline[index][2] && layer.timeline[index][1] === timelineLayer[1]) {
                            timelineLayer[2] = layer.timeline[index][2]
                            //clear browser cache and tile cache
                            vm.setUrlTimestamp(timelineLayer[2],moment.utc().unix())
                            timelineLayer[2].tileCache.clear()
                        }
                    })
                }
            })  
        }

        tileLayer.postAdd = function() {
            if (layer.refreshTimeline) {
                if (tileLayer.autoTimelineRefresh) {
                    clearInterval(tileLayer.autoTimelineRefresh)
                    tileLayer.autoTimelineRefresh = null
                }
                layer.refreshTimeline(true)
            } else {
                tileSource.setTileLoadFunction(vm.tileLoaderHook(tileSource, tileLayer))
            }

            // if the "refresh" option is set, set a timer
            // to force a reload of the tile content
            this.startAutoRefresh()
            if (layer.refresh) {
              tileLayer.set('updated', moment().toLocaleString())
              vm.$root.active.refreshRevision += 1
            }
        }

        tileLayer.postRemove = function () {
          vm._postRemove(this)
          if (this.autoTimelineRefresh) {
              clearInterval(this.autoTimelineRefresh)
              this.autoTimelineRefresh = null
          }
        }   

        tileLayer.refresh = function() {
            if (!layer.refreshTimeline) {
                this.set('updated', moment().toLocaleString())
                vm.$root.active.refreshRevision += 1
            }
            vm.refreshLayerTile(this)
        }

        tileLayer.stopAutoRefresh = function() {
            vm._stopAutoRefresh(this)
        }

        tileLayer.startAutoRefresh = function() {
            vm._startAutoRefresh(this)
        }

        return tileLayer
      },

      // loader to create a WMTS layer from a kmi datasource
      createWMSLayer: function (layer) {
        if (layer.mapLayer) return layer.mapLayer
        var vm = this
        layer.layerid = layer.layerid || getLayerId(layer.id)
        layer.wmsOptions.params = $.extend({
          opacity: 1,
          format: 'image/png',
          style: '',
          srs: 'EPSG:4326',
        }, layer.wmsOptions.params||{})

        // create a tile source
        var imgSource = new ol.source.ImageWMS({
          url: layer.wmsOptions.url,
          crossOrigin :'use-credentials',
          serverType:layer.wmsOptions.serverType || "geoserver",
          params:{
            LAYERS:layer.layerid,
            styles:layer.wmsOptions.params.style
          },
          projection: layer.wmsOptions.params.srs,
        })

        var imgLayer = new ol.layer.Image({
          opacity: layer.wmsOptions.opacity || 1,
          source: imgSource
        })

        // hook the tile loading function to update progress indicator
        imgLayer.progress = ''

        imgLayer.postRemove = function () {
          vm._postRemove(this)
        }  

        imgLayer.setParams = function(options) {
            var params = imgSource.getParams()
            $.extend(params,options)
            params["timestamp"] = moment.utc().unix()
            imgSource.updateParams(params)
        }

        imgLayer.refresh = function() {
            if (layer.wmsOptions.refresh) {
                imgLayer.set('updated', moment().toLocaleString())
                vm.$root.active.refreshRevision += 1
            }
            var params = imgSource.getParams()
            params["timestamp"] = moment.utc().unix()
            imgSource.updateParams(params)
        }

        // set properties for use in layer selector
        imgLayer.set('name', layer.name,false)
        imgLayer.set('id', layer.mapLayerId,false)
        imgLayer.layer = layer
        layer.mapLayer = imgLayer

        if (options.lastUpdatetime) {
            imgLayer.set('updated',layer.lastUpdatetime)
        }

        imgLayer.stopAutoRefresh = function() {
            vm._stopAutoRefresh(this)
        }

        imgLayer.startAutoRefresh = function() {
            vm._startAutoRefresh(this,layer.wmsOptions)
        }

        imgLayer.postAdd = function() {
            // if the "refresh" option is set, set a timer
            // to force a reload of the tile content
            this.startAutoRefresh()
            if (layer.wmsOptions.refresh) {
              imgLayer.set('updated', moment().toLocaleString())
              vm.$root.active.refreshRevision += 1
            }
        }

        return imgLayer
      },
      enableDependentLayer:function(olLayer,dependentLayerId,enabled) {
        if (!olLayer.layer || !olLayer.layer.dependentLayers) return

        var dependentLayer = olLayer.layer.dependentLayers.find(function(l) {return l.mapLayerId === dependentLayerId})
        
        if (!enabled) {
            //disable dependent layer
            if (dependentLayer && dependentLayer.mapLayer) {
                dependentLayer.mapLayer.show = false
                if (this.olmap.getLayers().getArray().find(function(l) {return l === dependentLayer.mapLayer})) {
                    this.active.removeLayer(dependentLayer.mapLayer)
                }
            }
            return
        }
        //enable dependent layer
        if (dependentLayer && dependentLayer.mapLayer && this.olmap.getLayers().getArray().find(function(l) {return l === dependentLayer.mapLayer})) {
            //already enabled
            dependentLayer.mapLayer.show = true
            return 
        }
        var index = this.olmap.getLayers().getArray().findIndex(function(l) {return l === olLayer})
        if (index < 0) return
        var vm = this
        for(var i = olLayer.layer.dependentLayers.length - 1;i >= 0;i--) {
            l = olLayer.layer.dependentLayers[i]  
            if (l.mapLayerId === dependentLayerId) {
                vm.olmap.getLayers().insertAt(index,l.mapLayer)
                l.mapLayer.show = true
                vm.olmap.dispatchEvent(vm.createEvent(vm,"addLayer",{mapLayer:l.mapLayer}))
                break
            } else if (l.mapLayer.show){
                --index
            }
        }
      },
      getMapLayer: function (id) {
        if (!this.olmap) { return undefined}
        if (id && id.mapLayerId) { id = id.mapLayerId} // if passed a catalogue layer, get actual id
        return this.olmap.getLayers().getArray().find(function (layer) {
          return layer.get('id') === id
        })
      },
      // initialise map
      init: function (options) {
        var vm = this
        options = options || {}

        // add some extra projections
        proj4.defs("EPSG:28349","+proj=utm +zone=49 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
        proj4.defs("EPSG:28350","+proj=utm +zone=50 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
        proj4.defs("EPSG:28351","+proj=utm +zone=51 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
        proj4.defs("EPSG:28352","+proj=utm +zone=52 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
        proj4.defs("EPSG:28353","+proj=utm +zone=53 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
        proj4.defs("EPSG:28354","+proj=utm +zone=54 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
        proj4.defs("EPSG:28355","+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
        proj4.defs("EPSG:28356","+proj=utm +zone=56 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

        // bump search bar over if there's no fullscreen button
        if (!ol.control.FullScreen.isFullScreenSupported()) {
          $('#map-search').addClass('noFullScreen')
          $('#map-search-button').addClass('noFullScreen')
        }

        this.olmap = new ol.Map({
          logo: false,
          renderer: 'canvas',
          target: 'map',
          view: new ol.View({
            projection: 'EPSG:4326',
            center: vm.view.center,
            zoom: 6,
            maxZoom: 21,
            minZoom: 5
          }),
          controls:[],
          interactions: ol.interaction.defaults({
            altShiftDragRotate: false,
            pinchRotate: false,
            dragPan: false,
            doubleClickZoom: false,
            keyboard: false
          })
        })

        this.setScale(this.view.scale / 1000)

        // add some default interactions
        this.olmap.addInteraction(this.dragPanInter)
        this.olmap.addInteraction(this.doubleClickZoomInter)
        this.olmap.addInteraction(this.keyboardPanInter)
        this.olmap.addInteraction(this.keyboardZoomInter)
        this.olmap.addInteraction(this.middleDragPanInter)

        // Create the graticule component
        this.graticule.setMap(this.olmap)

        // setup scale events
        this.olmap.on('postrender', function () {
          vm.scale = vm.getScale()
        })

        vm.olmap.on("removeLayer",function(ev){
            if (ev.mapLayer.postRemove) ev.mapLayer.postRemove()
            if (ev.layer.dependentLayers) {
              $.each(ev.layer.dependentLayers,function(index,dependentLayer){
                  if (!dependentLayer["mapLayer"]) {
                    return
                  }
                  if (dependentLayer["mapLayer"].show) {
                    delete dependentLayer["mapLayer"]["show"]
                    vm.active.removeLayer(dependentLayer["mapLayer"])
                  } else if (dependentLayer["mapLayer"].postRemove) {
                    dependentLayer["mapLayer"].postRemove()
                  }
              })
            }
        })

        vm.olmap.on("addLayer",function(ev){
            if (ev.mapLayer.postAdd) ev.mapLayer.postAdd()
            if (ev.mapLayer.layer && ev.mapLayer.layer.dependentLayers) {
              var position = vm.olmap.getLayers().getArray().findIndex(function(l){return l === ev.mapLayer})
              if (position >= 0) {
                  $.each(ev.mapLayer.layer.dependentLayers,function(index,l){
                      if (!l.mapLayer) {
                          l.mapLayer = vm['create' + l.type](l)
                          l.mapLayer.setOpacity(l.opacity || 1)
                          l.mapLayer.dependentLayer = true
                      }
                      if (l.autoAdd === false) return
                      vm.olmap.getLayers().insertAt(position++,l.mapLayer)
                      l.mapLayer.show = true
                      vm.olmap.dispatchEvent(vm.createEvent(vm,"addLayer",{mapLayer:l.mapLayer}))

                  })
              }
            }
        })

        vm.olmap.on("changeLayerOrder",function(ev){
            if (ev.mapLayer.layer.dependentLayers) {
              //remove dependentlayer first
              $.each(ev.mapLayer.layer.dependentLayers,function(index,dependentLayer){
                  if (!dependentLayer["mapLayer"] || !dependentLayer["mapLayer"].show) {
                    return
                  }
                  vm.olmap.removeLayer(dependentLayer["mapLayer"])
              })
              //add dependentlayer at the correct position
              var position = vm.olmap.getLayers().getArray().findIndex(function(l){return l === ev.mapLayer})
              if (position >= 0) {
                  $.each(ev.mapLayer.layer.dependentLayers,function(index,dependentLayer){
                      if (dependentLayer.mapLayer && dependentLayer.mapLayer.show) {
                          vm.olmap.getLayers().insertAt(position++, dependentLayer.mapLayer)
                      }
                  })
              }
              //send changLayerOrder for dependent layers
              $.each(ev.mapLayer.layer.dependentLayers,function(index,dependentLayer){
                  if (!dependentLayer["mapLayer"] || !dependentLayer["mapLayer"].show || !dependentLayer.dependentLayers) {
                    return
                  }
                  vm.olmap.dispatchEvent(vm.createEvent(vm,"changeLayerOrder",{mapLayer:dependentLayer.mapLayer}))
              })

            }
        })

      },

      initLayers: function (activeLayers) {
        var vm = this
        vm._overviewLayer = vm._overviewLayer || $.extend({},vm.$root.catalogue.getLayer(vm.env.overviewLayer || "dpaw:mapbox_outdoors"))

        //ignore the active layers which does not exist in the catalogue layers.
        activeLayers = activeLayers.filter(function(activeLayer){
            return vm.$root.catalogue.getLayer(activeLayer[0]) && true
        })
        //merge custom options of active layer to catalogue layer
        var initialLayers = activeLayers.reverse().map(function (activeLayer) {
          return $.extend(vm.$root.catalogue.getLayer(activeLayer[0]), activeLayer[1])
        })
        //add active layers into map
        $.each(initialLayers,function(index,layer) {
            vm.catalogue.onLayerChange(layer,true)
        })
        //enable controls
        vm.mapControls = $.extend(vm.mapControls,{
            "zoom": {
                enabled:false,
                autoenable:false,
                controls:new ol.control.Zoom({
                  target: $('#external-controls').get(0)   
                })
            },
            "overviewMap": {
                enabled:false,
                autoenable:false,
                controls:new ol.control.OverviewMap({
                    className: 'ol-overviewmap ol-custom-overviewmap',
                    layers: [],
                    collapseLabel: '\u00BB',
                    label: '\u00AB',
                    collapsed: false,
                    view: new ol.View({
                        projection: 'EPSG:4326',
                    })
                }),
                preenable:function(enable){
                    if (enable) {
                        this.controls.getOverviewMap().addLayer(vm['create' + vm._overviewLayer.type](vm._overviewLayer))
                        vm._overviewLayer.mapLayer.postAdd()
                    } else {
                        if (this._interact) {
                            this._interact.unset()
                            this._interact = null
                        }
                        try {
                            this.controls.getOverviewMap().removeLayer(this.controls.getOverviewMap().getLayers().item(0))
                        } catch (ex) {
                        }
                    }
                },
                postenable:function(enable) {
                    if (enable) {
                        var overviewMapControl = this.controls
                        var extentbox = $(".ol-custom-overviewmap").find(".ol-overlay-container")
                        var overviewMap = $(".ol-custom-overviewmap").find(".ol-overviewmap-map")
                        if (extentbox.length) {
                            this._interact = interact(extentbox.get(0),{})
                            .draggable({
                                intertia:true,
                                restrict:{
                                    restriction:overviewMap.get(0),
                                    endOnly:true,
                                    elementRect:{top:0,left:0,bottom:1,right:1}
                                },
                                autoScroll:true,
                                onmove: function(event){
                                    // keep the dragged position in the data-x/data-y attributes
                                    //console.log(extentbox.get(0).style.left + "\t" + extentbox.get(0).style.right + "\t" + extentbox.get(0).style.top + "\t" + extentbox.get(0).style.bottom)
                                    //console.log("x0 = " + event.x0 +",y0= " + event.y0 + ",clientX0=" + event.clientX0 + ",clientY0=" + event.clientY0 + ",dx=" + event.dx + ",dy=" + event.dy)
                                    if (extentbox.get(0).style.left) {
                                        extentbox.get(0).style.left = (parseInt(extentbox.get(0).style.left) + event.dx) + "px"
                                    }
                                    if (extentbox.get(0).style.right) {
                                        extentbox.get(0).style.right = (parseInt(extentbox.get(0).style.right) + event.dx) + "px"
                                    }
                                    if (extentbox.get(0).style.bottom) {
                                        extentbox.get(0).style.bottom = (parseInt(extentbox.get(0).style.bottom) - event.dy) + "px"
                                    }
                                    if (extentbox.get(0).style.top) {
                                        extentbox.get(0).style.top = (parseInt(extentbox.get(0).style.top) - event.dy) + "px"
                                    }
                                },
                                onend:function(event) {
                                    var centralPosition = [
                                        (extentbox.get(0).style.left)?(parseInt(extentbox.get(0).style.left) + extentbox.width() / 2):(parseInt(extentbox.get(0).style.right) - extentbox.width() / 2) ,
                                        (extentbox.get(0).style.bottom)?(overviewMap.height() - parseInt(extentbox.get(0).style.bottom) - extentbox.height() / 2):(overviewMap.height() - parseInt(extentbox.get(0).style.top) + extentbox.height() / 2)
                                    ]
                                    //console.log(extentbox.get(0).style.left + "\t" + extentbox.get(0).style.bottom + "\t" + extentbox.width() + "\t" + extentbox.height() + "\t" + centralPosition + "\t" + overviewMapControl.getOverviewMap().getCoordinateFromPixel(centralPosition))
                                    overviewMapControl.getMap().getView().setCenter(overviewMapControl.getOverviewMap().getCoordinateFromPixel(centralPosition))
                                }
                            })
                        }
                    }
                }
            },
            "scaleLine": {
                enabled:false,
                autoenable:false,
                controls:new ol.control.ScaleLine()
            },
            "mousePosition": {
                enabled:false,
                controls:new ol.control.MousePosition({
                    coordinateFormat: function(coordinate) {
                        return vm.getDeg(coordinate)+'<br/>'+vm.getDMS(coordinate)+'<br/>'+vm.getMGA(coordinate)
                    }
                })
            },
            "fullScreen": {
                enabled:false,
                controls:new ol.control.FullScreen({
                    source: $('body').get(0),
                    target: $('#external-controls').get(0),
                    label: $('<i/>', {
                        class: 'fa fa-expand'
                    })[0]
                })
            },
            "scale": {
                enabled:false,
                autoenable:false,
                controls:new ol.control.Control({
                    element: $('#menu-scale').get(0),
                    target: $('#external-controls').get(0)
            })},
            "attribution": {
                enabled:false,
                controls:new ol.control.Attribution()
            },
        })
        $.each(vm.mapControls,function(key,control){
            if (control.autoenable === undefined || control.autoenable) {
                vm.enableControl(key,true)
            }
        })
      },
      zoomToSelected: function (minScale,getExtent) {
        var selectedFeatures = this.annotations.selectedFeatures
        if (selectedFeatures.getLength() === 0) {
            return
        } else {
            var extent = null
            if (selectedFeatures.getLength() === 1) {
                extent = getExtent?getExtent(selectedFeatures.item(0)):selectedFeatures.item(0).getGeometry().getExtent()
                extent = ol.extent.isEmpty(extent)?null:extent
            } else {
                selectedFeatures.forEach(function (f) {
                    if (!ol.extent.isEmpty(getExtent?getExtent(f):f.getGeometry().getExtent())) {
                      extent = extent || ol.extent.createEmpty()
                      ol.extent.extend(extent, getExtent?getExtent(f):f.getGeometry().getExtent())
                    }
                })
            }
            if (extent) {
                this.olmap.getView().fit(extent, this.olmap.getSize())
                if (minScale && this.getScale() < minScale) {
                    this.setScale(minScale)
                }
            }
        }
      },
      setRefreshInterval: function(layer,interval) {
          var vm = this
          layer.refresh = interval
          if (layer.dependentLayers) {
            $.each(layer.dependentLayers,function(index,dependentLayer){
                vm.setRefreshInterval(dependentLayer,dependentLayer.inheritRefresh?layer.refresh:dependentLayer.refresh)
            })
          }
      },
      //Return the first feature which contains the coordinate.
      //layers: list of layer definition.{id:layerId,geom_field:geometry field,properties:{field:column}}
      getFeature:function(layers,coordinate,successCallback,failedCallback) {
          var vm = this
          if (!Array.isArray(layers)) {
              layers = [layers]
          }
          var _getFeature = function(index) {
            $.ajax({
                url:vm.env.kmiService + "/wfs?service=wfs&version=2.0&request=GetFeature&typeNames=" + getLayerId(layers[index]["id"]) + "&outputFormat=json&cql_filter=CONTAINS(" + (layers[index]["geom_field"] || "wkb_geometry") + ",POINT(" + coordinate[1]  + " " + coordinate[0] + "))",
                dataType:"json",
                success: function (response, stat, xhr) {
                   if (response.totalFeatures === 0) {
                       if (index === layers.length - 1) {
                            if (successCallback) {
                                successCallback(null)
                            } else {
                                alert("No found")
                            }
                       } else {
                            _getFeature(index + 1)
                       }
                    } else {
                        var feature = null
                        if (layers[index]["properties"]) {
                            feature = {}
                            $.each(layers[index]["properties"],function(field,column){
                                feature[field] = response.features[0]["properties"][column]
                            })
                        } else {
                            feature = response.features[0]
                        }
                        if (successCallback) {
                            successCallback(feature)
                        } else {
                            alert(JSON.stringify(feature))
                        }
                    }
                },
                error: function (xhr,status,message) {
                    if (failedCallback) {
                        alert(xhr.status + " : " + (xhr.responseText || message))
                    } else {
                        failedCallback(xhr.status + " : " + (xhr.responseText || message))
                    }
                },
                xhrFields: {
                    withCredentials: true
                }
            })
        }
        _getFeature(0)
      },
      getGridData:function(coordinate,successCallback,failedCallback) {
          if (!successCallback) {
              successCallback = function(data) {alert(data)}
          }
          if (!failedCallback) {
              failedCallback = function(msg) {alert(msg)}
          }
          var vm = this
          var feat = new ol.Feature({geometry:new ol.geom.Point(coordinate)})
          $.ajax({
              url:vm.env.gokartService + "/spatial",
              dataType:"json",
              data:{
                  features:vm.$root.geojson.writeFeatures([feat]),
                  options:JSON.stringify({
                      grid: {
                          action:"getClosestFeature",
                          layers:[
                              {
                                  id:"fd_grid_points",
                                  layerid:getLayerId("cddp:fd_grid_points"),
                                  kmiservice:vm.env.kmiService,
                                  buffer:120,
                                  properties:{
                                      grid:"fdgrid",
                                  },
                              },
                              {
                                  id:"pilbara_grid_1km",
                                  layerid:getLayerId("cddp:pilbara_grid_1km"),
                                  buffer:800,
                                  kmiservice:vm.env.kmiService,
                                  properties:{
                                      grid:"id",
                                  },
                              },
                          ],
                      }
                  })
              },
              method:"POST",
              success: function (response, stat, xhr) {
                  if (response.features[0]["grid"]["failed"]) {
                      failedCallback(response.features[0]["grid"]["failed"])
                  } else if (response.features[0]["grid"]["id"] === "fd_grid_points") {
                      successCallback("FD:" + response.features[0]["grid"]["feature"]["grid"]) 
                  } else if (response.features[0]["grid"]["id"] === "pilbara_grid_1km") {
                      successCallback("PIL:" + response.features[0]["grid"]["feature"]["grid"]) 
                  } else {
                      successCallback(null) 
                  }
              },
              error: function (xhr,status,message) {
                  failedCallback(xhr.status + " : " + (xhr.responseText || message))
              },
              xhrFields: {
                  withCredentials: true
              }
          })
      },
      getPosition:function(coordinate,successCallback,failedCallback) {
          if (!successCallback) {
              successCallback = function(data) {alert(data)}
          }
          if (!failedCallback) {
              failedCallback = function(msg) {alert(msg)}
          }
          var buffers = [50,100,150,200,300,400,1000,2000,100000]
          var vm = this
          var _getPosition = function(index) {
            var buffered = turf.bbox(turf.buffer(turf.point(coordinate),buffers[index],"kilometers"))
            $.ajax({
                url:vm.env.kmiService + "/wfs?service=wfs&version=2.0&request=GetFeature&typeNames=" + getLayerId("cddp:townsite_points") + "&outputFormat=json&bbox=" + buffered[1] + "," + buffered[0] + "," + buffered[3] + "," + buffered[2],
                dataType:"json",
                success: function (response, stat, xhr) {
                   if (response.totalFeatures === 0) {
                        _getPosition(index + 1)
                    } else {
                        var nearestTown = null
                        var nearestDistance = null
                        var distance = null
                        $.each(response.features,function(index,feature){
                            if (nearestTown === null) {
                                nearestTown = feature
                                nearestDistance = vm.measure.getLength([feature.geometry.coordinates,coordinate])
                            } else {
                                distance = vm.measure.getLength([feature.geometry.coordinates,coordinate])
                                if (distance < nearestDistance) {
                                    nearestTown = feature
                                    nearestDistance = distance
                                }
                            }
                        })
                        nearestDistance = vm.measure.formatLength(nearestDistance,"km")
                        var bearing = null
                        var position = null
                        if (nearestDistance === 0) {
                            position = "0m of " + nearestTown.properties["name"]
                        } else {
                            bearing = vm.measure.getBearing(nearestTown.geometry.coordinates,coordinate)
                            position = nearestDistance + " " + vm.measure.getDirection(bearing,16) + " of " + nearestTown.properties["name"]
                        }
                        successCallback(position)
                    }
                },
                error: function (xhr,status,message) {
                    failedCallback(xhr.status + " : " + (xhr.responseText || message))
                },
                xhrFields: {
                    withCredentials: true
                }
            })
        }
        _getPosition(0)
      },
    },
    ready: function () {
      var vm = this
      var mapStatus = this.loading.register("olmap","Open layer map Component")
      mapStatus.phaseBegin("initialize",20,"Initialize")
      this.svgBlobs = {}
      this.svgTemplates = {}
      this.cachedStyles = {}
      this.jobs = {}

      this._setRefreshInterval = function(layer,interval) {
          layer.refresh = interval
          if (layer.dependentLayers) {
            $.each(layer.dependentLayers,function(index,dependentLayer){
                if (dependentLayer.inheritRefresh) {
                    dependentLayer["mapLayer"].stopAutoRefresh()
                }
            })
          }
      }
      this._stopAutoRefresh = function(olLayer) {
          if (olLayer.autoRefresh) {
              clearInterval(olLayer.autoRefresh)
              delete olLayer.autoRefresh
          }
          if (olLayer.layer.dependentLayers) {
            $.each(olLayer.layer.dependentLayers,function(index,dependentLayer){
                if (dependentLayer["mapLayer"]) {
                    dependentLayer["mapLayer"].stopAutoRefresh()
                }
            })
          }
      }

      this._startAutoRefresh = function(olLayer) {
          if (options.refresh && !olLayer.autoRefresh ) {
              olLayer.autoRefresh = setInterval(function () {
                  olLayer.refresh()
              }, olLayer.layer.refresh * 1000)
          }
          if (olLayer.layer.dependentLayers) {
            $.each(olLayer.layer.dependentLayers,function(index,dependentLayer){
                if (dependentLayer["mapLayer"] && dependentLayer["mapLayer"].show) {
                    dependentLayer["mapLayer"].startAutoRefresh()
                }
            })
          }
      }

      this._postRemove = function(olLayer) {
          this._stopAutoRefresh(olLayer)
          if (olLayer.autoTimelineRefresh) {
            clearTimeout(olLayer.autoTimelineRefresh)
            olLayer.autoTimelineRefresh = null
          }
          if (!olLayer.dependentLayer) {
            delete olLayer.layer["mapLayer"]
            delete olLayer["layer"]
          }
      }

      // generate matrix IDs from name and level number
      $.each(this.matrixSets, function (name, matrixSet) {
          var matrixIds = new Array(matrixSet.maxLevel - matrixSet.minLevel + 1)
          for (var z = matrixSet.minLevel; z <= matrixSet.maxLevel; ++z) {
            matrixIds[z] = name + ':' + z
          }
          matrixSet.matrixIds = matrixIds
      })

      mapStatus.phaseEnd("initialize")

      mapStatus.phaseBegin("gk-init",60,"Listen 'gk-init' event",true,true)
      this.$on('gk-init', function() {
        mapStatus.phaseEnd("gk-init")
        
        mapStatus.phaseBegin("post-init",20,"Post initialize")
        if ($("#map .ol-viewport canvas").attr("width")) {
            vm.displayResolution[0] = Math.round(($("#map .ol-viewport canvas").attr("width") /  $("#map .ol-viewport canvas").width()) * 100) / 100
        }
        if ($("#map .ol-viewport canvas").attr("height")) {
            vm.displayResolution[1] = Math.round(($("#map .ol-viewport canvas").attr("height") /  $("#map .ol-viewport canvas").height()) * 100) / 100
        }

        vm.showGraticule(vm.displayGraticule)

        mapStatus.phaseEnd("post-init")
        return true
      })
    }
  }
</script>
