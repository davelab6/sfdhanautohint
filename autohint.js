var upm = 1000;

function Point(x, y, on, interpolated){
	this.xori = x;
	this.yori = y;
	this.xtouch = x;
	this.ytouch = y;
	this.touched = false;
	this.donttouch = false;
	this.on = on;
	this.interpolated = interpolated;
}
function Contour(){
	this.points = []
	this.ccw = false
}
Contour.prototype.stat = function(){
	var xoris = this.points.map(function(p){ return p.xori })
	var yoris = this.points.map(function(p){ return p.yori })
	this.xmax = Math.max.apply(Math, xoris)
	this.ymax = Math.max.apply(Math, yoris)
	this.xmin = Math.min.apply(Math, xoris)
	this.ymin = Math.min.apply(Math, yoris)
	this.orient()
}
Contour.prototype.orient = function() {
	// Findout PYmin
	var jm = 0, ym = this.points[0].yori
	for(var j = 0; j < this.points.length - 1; j++) if(this.points[j].yori < ym){
		jm = j; ym = this.points[j].yori;
	}
	var p0 = this.points[(jm ? jm - 1 : this.points.length - 2)], p1 = this.points[jm], p2 = this.points[jm + 1];
	var x = ((p0.xori - p1.xori) * (p2.yori - p1.yori) - (p0.yori - p1.yori) * (p2.xori - p1.xori))
	if(x < 0) this.ccw = true;
	else if(x === 0) this.ccw = p2.xori > p1.xori
}
var inPoly = function (point, vs) {
    // ray-casting algorithm based on
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
    
    var x = point.xori, y = point.yori;
    
    var inside = false;
    for (var i = 0, j = vs.length - 2; i < vs.length - 1; j = i++) {
        var xi = vs[i].xori, yi = vs[i].yori;
        var xj = vs[j].xori, yj = vs[j].yori;
        
        var intersect = ((yi > y) != (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
};
Contour.prototype.includes = function(that){
	for(var j = 0; j < that.points.length - 1; j++){
		if(!inPoly(that.points[j], this.points)) return false
	}
	return true;
}
function Glyph(contours){
	this.contours = contours || []
	this.stems = []
}
function numberPoints(contours){
	var n = 0
	for(var j = 0; j < contours.length; j++){
		for(var k = 0; k < contours[j].points.length - 1; k++) if(!contours[j].points[k].interpolated)
			contours[j].points[k].id = (n++)
	}
	return n;
}
function parseSFD(input){
	var contours = [], currentContour = null
	input = input.trim().split('\n');
	for(var j = 0; j < input.length; j++){
		var line = input[j].trim().split(/ +/);
		if(line[2] === 'm'){
			// Moveto
			if(currentContour) contours.push(currentContour);
			currentContour = new Contour();
			currentContour.points.push(new Point(line[0] - 0, line[1] - 0, true))
		} else if(line[2] === 'l' && currentContour){
			// Lineto
			currentContour.points.push(new Point(line[0] - 0, line[1] - 0, true))
		} else if(line[6] === 'c' && currentContour){
			// curveTo
			currentContour.points.push(new Point(line[0] - 0, line[1] - 0, false))
			currentContour.points.push(new Point(line[4] - 0, line[5] - 0, true, /^128,/.test(line[7])))
		}
	}
	if(currentContour) contours.push(currentContour);
	contours.forEach(function(c){ c.stat() })
	var nPoints = numberPoints(contours);
	var glyph = new Glyph(contours);
	glyph.nPoints = nPoints;
	return glyph
}

function overlapRatio(a, b){
	var events = []
	for(var j = 0; j < a.length; j++){
		var low = Math.min(a[j][0].xori, a[j][a[j].length - 1].xori)
		var high = Math.max(a[j][0].xori, a[j][a[j].length - 1].xori)
		events.push({at: low, on: true, a: true})
		events.push({at: high, on: false, a: true})
	}
	var probeb = new Array(upm);
	for(var j = 0; j < b.length; j++){
		var low = Math.min(b[j][0].xori, b[j][b[j].length - 1].xori)
		var high = Math.max(b[j][0].xori, b[j][b[j].length - 1].xori)
		events.push({at: low, on: true, a: false})
		events.push({at: high, on: false, a: false})
	}
	events.sort(function(p, q){ return p.at - q.at })
	var len = 0, la = 0, lb = 0;
	var st = 0, sa = 0, sb = 0;
	var ac = 0;
	var bc = 0;
	for(var j = 0; j < events.length; j++){
		var e = events[j]
		var intersectBefore = ac * bc;
		var ab = ac, bb = bc;
		if(e.a) { if(e.on) ac += 1; else ac -= 1 }
		else    { if(e.on) bc += 1; else bc -= 1 }
		if(ac * bc && !intersectBefore) st = e.at;
		if(!(ac * bc) && intersectBefore) len += e.at - st;
		if(ac && !ab) sa = e.at;
		if(!ac && ab) la += e.at - sa;
		if(bc && !bb) sb += e.at;
		if(!bc && bb) lb += e.at - sb;
	}

	return len / Math.max(la, lb)
}

function enoughOverlapBetweenSegments(a, b, ratio){
	return overlapRatio(a, b) >= ratio
}
function enoughOverlapBetweenStems(a, b){
	return enoughOverlapBetweenSegments(a.low, b.low, MIN_STEM_OVERLAP_RATIO) 
		|| enoughOverlapBetweenSegments(a.high, b.high, MIN_STEM_OVERLAP_RATIO) 
		|| enoughOverlapBetweenSegments(a.low, b.high, MIN_STEM_OVERLAP_RATIO) 
		|| enoughOverlapBetweenSegments(a.high, b.low, MIN_STEM_OVERLAP_RATIO)
}


var MIN_OVERLAP_RATIO = 0.3;
var MIN_STEM_OVERLAP_RATIO = 0.2;
var Y_FUZZ = 3
var SLOPE_FUZZ = 0.04

function findStems(glyph, strategy) {
	var MIN_STEM_WIDTH = strategy.MIN_STEM_WIDTH;
	var MAX_STEM_WIDTH = strategy.MAX_STEM_WIDTH;
	var blueFuzz = strategy.BLUEZONE_WIDTH || 15;

	function statGlyph(contours){
		var points = []
		points = points.concat.apply(points, contours.map(function(c){ return c.points }));
		var ys = points.map(function(p){ return p.yori })
		var xs = points.map(function(p){ return p.xori })
		return {
			xmax: Math.max.apply(Math, xs),
			ymax: Math.max.apply(Math, ys),
			xmin: Math.min.apply(Math, xs),
			ymin: Math.min.apply(Math, ys)
		}
	}
	function rootof(radical){
		if(radical.root === radical) return radical;
		else {
			// Path compression
			var r = rootof(radical.root);
			radical.root = r;
			return r;
		}
	};
	function inclusionToRadicals(inclusions, contours, j, orient){
		if(orient) {
			var radicals = []
			for(var k = 0; k < contours.length; k++) if(inclusions[j][k]) {
				if(contours[k].ccw !== orient) {
					radicals = radicals.concat(inclusionToRadicals(inclusions, contours, k, !orient))
				}
			};
			return radicals
		} else {
			var radical = {parts: [contours[j]], outline: contours[j]};
			var radicals = [radical];
			for(var k = 0; k < contours.length; k++) if(inclusions[j][k]) {
				if(contours[k].ccw !== orient) {
					radical.parts.push(contours[k]);
					radicals = radicals.concat(inclusionToRadicals(inclusions, contours, k, !orient))
				}
			};
			return radicals
		}
	};
	function transitiveReduce(g){
		for(var x = 0; x < g.length; x++) for(var y = 0; y < g.length; y++) for(var z = 0; z < g.length; z++) {
			if(g[x][y] && g[y][z]) g[x][z] = false;
		}
	}
	function findRadicals(contours){
		var inclusions = [];
		var radicals = []
		for(var j = 0; j < contours.length; j++){
			inclusions[j] = [];
			contours[j].outline = true;
		}
		// Merge disjoint sets
		for(var j = 0; j < contours.length; j++) {
			for(var k = 0; k < contours.length; k++) {
				if(j !== k && contours[j].includes(contours[k])) {
					inclusions[j][k] = true;
					contours[k].outline = false;
				}
			}
		};
		transitiveReduce(inclusions);
		for(var j = 0; j < contours.length; j++) if(contours[j].outline) {
			radicals = radicals.concat(inclusionToRadicals(inclusions, contours, j, contours[j].ccw))
		};
		return radicals;
	};

	function findHorizontalSegments(radicals){
		var segments = []
		for(var r = 0; r < radicals.length; r++) {
			radicals[r].mergedSegments = []
			for(var j = 0; j < radicals[r].parts.length; j++){
				var contour = radicals[r].parts[j];
				var lastPoint = contour.points[0]
				var segment = [lastPoint];
				segment.radical = r;
				for(var k = 1; k < contour.points.length - 1; k++) if(!contour.points[k].interpolated) {
					if(Math.abs((contour.points[k].yori - lastPoint.yori) / (contour.points[k].xori - lastPoint.xori)) <= SLOPE_FUZZ) {
						segment.push(contour.points[k])
					} else {
						if(segment.length > 1) segments.push(segment)
						lastPoint = contour.points[k];
						segment = [lastPoint]
						segment.radical = r;
					}
				};
				if(Math.abs((contour.points[0].yori - lastPoint.yori) / (contour.points[0].xori - lastPoint.xori)) <= SLOPE_FUZZ) {
					segment.push(contour.points[0])
					segment.push(contour.points[contour.points.length - 1])
				}
				if(segment.length > 1) segments.push(segment)
			}
		}

		segments = segments.sort(function(p, q){ return p.xori - q.xori })

		for(var j = 0; j < segments.length; j++) if(segments[j]){
			var pivot = [segments[j]];
			var pivotRadical = segments[j].radical;
			var orientation = pivot[0][1].xori > pivot[0][0].xori
			segments[j] = null;
			for(var k = j + 1; k < segments.length; k++) if(segments[k] && Math.abs(segments[k][0].yori - pivot[0][0].yori) <= Y_FUZZ && segments[k].radical === pivotRadical && orientation === (segments[k][1].xori > segments[k][0].xori)){
				var r = pivot.radical;
				pivot.push(segments[k])
				segments[k] = null;
			}
			radicals[pivotRadical].mergedSegments.push(pivot.sort(function(s1, s2){
				return orientation ? s1[0].xori - s2[0].xori : s2[0].xori - s1[0].xori}))
		}
	}

	function pointBelowLine(point, y, xmin, xmax){
		return point.yori < y - blueFuzz && point.xori < xmax && point.xori > xmin
	}
	function getRadicalPointRelationships(stem, radical){
		var a0 = stem.low[0][0].xori, az = stem.low[stem.low.length - 1][stem.low[stem.low.length - 1].length - 1].xori
		var b0 = stem.high[0][0].xori, bz = stem.high[stem.high.length - 1][stem.high[stem.high.length - 1].length - 1].xori
		var xmin = Math.min(a0, b0, az, bz), xmax = Math.max(a0, b0, az, bz);
		for(var j = 0; j < radical.parts.length; j++) for(var k = 0; k < radical.parts[j].points.length - 1; k++) {
			var point = radical.parts[j].points[k];
			if(point.yori > stem.yori && point.xori < xmax - blueFuzz && point.xori > xmin + blueFuzz) {
				stem.hasRadicalPointAbove = true;
				stem.radicalCenterRise = Math.max(stem.radicalCenterRise || 0, point.yori - stem.yori)
			}
			if(point.yori > stem.yori && point.xori >= xmax - blueFuzz) {
				stem.hasRadicalRightAdjacentPointAbove = true;
				stem.radicalRightAdjacentRise = Math.max(stem.radicalRightAdjacentRise || 0, point.yori - stem.yori)
			}
			if(point.yori > stem.yori && point.xori <= xmin + blueFuzz) {
				stem.hasRadicalLeftAdjacentPointAbove = true;
				stem.radicalLeftAdjacentRise = Math.max(stem.radicalLeftAdjacentRise || 0, point.yori - stem.yori)
			}
			if(point.yori < stem.yori - stem.width && point.xori < xmax - blueFuzz && point.xori > xmin + blueFuzz) {
				stem.hasRadicalPointBelow = true;
				stem.radicalCenterDescent = Math.max(stem.radicalCenterDescent || 0, stem.yori - stem.width - point.yori)
			}
			if(point.yori < stem.yori - stem.width && point.xori >= xmax - blueFuzz) {
				stem.hasRadicalRightAdjacentPointBelow = true;
				stem.radicalRightAdjacentDescent = Math.max(stem.radicalRightAdjacentDescent || 0, stem.yori - stem.width - point.yori)
			}
			if(point.yori < stem.yori - stem.width && point.xori <= xmin + blueFuzz) {
				stem.hasRadicalLeftAdjacentPointBelow = true;
				stem.radicalLeftAdjacentDescent = Math.max(stem.radicalLeftAdjacentDescent || 0, stem.yori - stem.width - point.yori)
			}
		}
		stem.xmin = xmin;
		stem.xmax = xmax;
	}

	function stemSegments(radicals){
		var stems = [];
		for(var r = 0; r < radicals.length; r++) {
			var radicalStems = [];
			var segs = radicals[r].mergedSegments.sort(function(a, b){ return a[0][0].yori - b[0][0].yori});
			var ori = radicals[r].outline.ccw;
			// We stem segments bottom-up.
			for(var j = 0; j < segs.length; j++) if(segs[j] && ori === (segs[j][0][0].xori < segs[j][0][segs[j][0].length - 1].xori)) {
				var stem = {low: segs[j]};
				for(var k = j + 1; k < segs.length; k++) if(segs[k] && overlapRatio(segs[j], segs[k]) >= MIN_OVERLAP_RATIO) {
					if(ori !== (segs[k][0][0].xori < segs[k][0][segs[k][0].length - 1].xori)
							&& segs[k][0][0].yori - segs[j][0][0].yori <= MAX_STEM_WIDTH
							&& segs[k][0][0].yori - segs[j][0][0].yori >= MIN_STEM_WIDTH) {
						// A stem is found
						stem.high = segs[k];
						stem.yori = stem.high[0][0].yori;
						stem.width = Math.abs(segs[k][0][0].yori - segs[j][0][0].yori);
						getRadicalPointRelationships(stem, radicals[r]);
						stem.atGlyphTop = stem.high[0][0].yori >= stats.ymax - blueFuzz;
						stem.atGlyphBottom = stem.high[0][0].yori - stem.width <= stats.ymin + blueFuzz;
						stem.belongRadical = radicals[r];
						segs[j] = segs[k] = null;
						radicalStems.push(stem);
					}
					break;
				}
			};

			for(var k = 0; k < radicalStems.length; k++) {
				for(var j = 0; j < radicalStems.length; j++) {
					if(enoughOverlapBetweenStems(radicalStems[j], radicalStems[k]) && radicalStems[j].yori > radicalStems[k].yori) {
						radicalStems[k].hasSameRadicalStemAbove = radicalStems[k].hasGlyphStemAbove = true;
						radicalStems[j].hasSameRadicalStemBelow = radicalStems[j].hasGlyphStemBelow = true;
					}
				}
			}
			stems = stems.concat(radicalStems)
			radicals[r].stems = radicalStems;
		}
		for(var k = 0; k < stems.length; k++) {
			for(var j = 0; j < stems.length; j++) {
				if(enoughOverlapBetweenStems(stems[j], stems[k]) && stems[j].yori > stems[k].yori) {
					stems[k].hasGlyphStemAbove = true;
					stems[j].hasGlyphStemBelow = true;
				}
			}
		}
		return stems;
	}
	var radicals = findRadicals(glyph.contours);
	var stats = statGlyph(glyph.contours);
	findHorizontalSegments(radicals);
	var stems = stemSegments(radicals);
	glyph.radicals = radicals;
	glyph.stems = stems;
	return glyph;
}

function autohint(glyph, ppem, strategy) {
	var MIN_STEM_WIDTH = strategy.MIN_STEM_WIDTH;
	var MAX_STEM_WIDTH = strategy.MAX_STEM_WIDTH;
	var STEM_SIDE_MIN_RISE = strategy.STEM_SIDE_MIN_RISE || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_RISE = strategy.STEM_CENTER_MIN_RISE || STEM_SIDE_MIN_RISE;
	var STEM_SIDE_MIN_DESCENT = strategy.STEM_SIDE_MIN_DESCENT || strategy.MIN_STEM_WIDTH;
	var STEM_CENTER_MIN_DESCENT = strategy.STEM_CENTER_MIN_DESCENT || STEM_SIDE_MIN_DESCENT;

	var blueFuzz = strategy.BLUEZONE_WIDTH || 15;
	var shouldAddGlyphHeight = strategy.shouldAddGlyphHeight || function(stem, ppem, glyfTop, glyfBottom) {
		return stem.yori - stem.ytouch >= 0.25 * uppx
	}

	var contours = glyph.contours;
	function byyori(a, b){
		return a.yori - b.yori
	}
	var stems = glyph.stems.sort(byyori);

	var uppx = upm / ppem;
	var glyfBottom = -round(0.075 * upm)
	var glyfTop = round(0.84 * upm)

	function round(y){ return Math.round(y / upm * ppem) / ppem * upm }
	function roundDown(y){ return Math.floor(y / upm * ppem) / ppem * upm }
	function roundUp(y){ return Math.ceil(y / upm * ppem) / ppem * upm }
	function roundDownStem(stem){
		stem.roundMethod = -1; // Positive for round up, negative for round down
		if(roundUp(stem.yori) === roundDown(stem.yori)) {
			stem.ytouch = roundDown(stem.yori) - uppx;
		} else {
			stem.ytouch = roundDown(stem.yori);
		}
		stem.deltaY = 0
	}
	function roundUpStem(stem){
		stem.roundMethod = 1;
		stem.ytouch = roundUp(stem.yori);
		stem.deltaY = 0
	}
	function roundUpStem2(stem){
		stem.roundMethod = 2;
		stem.ytouch = roundUp(stem.yori) + uppx;
		stem.deltaY = 0
	}
	function alignStem(stem, that){
		while(that.alignTo) that = that.alignTo;
		stem.roundMethod = 0;
		stem.alignTo = that;
		stem.ytouch = that.ytouch;
	}
	function unalign(stem){
		stem.roundMethod = (stem.ytouch < stem.yori ? -1 : 1);
		stem.alignTo = null;
	}

	var WIDTH_FACTOR_X = 2
	var MIN_ADJUST_PPEM = 12
	var MAX_ADJUST_PPEM = 32

	function clamp(x){ return Math.min(1, Math.max(0, x)) }
	function calculateWidth(w){
		if(ppem < 20) return uppx;
		if(w < uppx) return uppx;
		else if (w < 2 * uppx) return uppx * WIDTH_FACTOR_X 
			* (w / uppx / WIDTH_FACTOR_X + clamp((ppem - MIN_ADJUST_PPEM) / (MAX_ADJUST_PPEM - MIN_ADJUST_PPEM)) * (1 - w / uppx / WIDTH_FACTOR_X));
		else return w;
	}

	function initStemTouches(stems, radicals) {
		for(var j = 0; j < stems.length; j++) {
			var w = calculateWidth(stems[j].width);
			if(w < 1.9 * uppx) w = uppx
			// stems[j].touchwidth = w;
			stems[j].touchwidth = uppx;
			stems[j].alignTo = null;
			roundDownStem(stems[j])
			if(stems[j].ytouch - roundUp(w) < glyfBottom){
				roundUpStem(stems[j])
			} else if(!atGlyphBottom(stems[j]) && stems[j].ytouch - roundUp(w) <= glyfBottom) {
				roundUpStem(stems[j])
			}
		}
	}
	var COLLISION_FUZZ = 1.04;
	var HIGHLY_COLLISION_FUZZ = 0.3;
	function collideWith(stems, transitions, j, k){
		return transitions[j][k] && (stems[j].ytouch > stems[k].ytouch 
			? stems[j].ytouch - stems[k].ytouch <= stems[j].touchwidth * COLLISION_FUZZ 
			: stems[k].ytouch - stems[j].ytouch <= stems[k].touchwidth * COLLISION_FUZZ)
	}
	function highlyCollideWith(stems, transitions, j, k){
		return transitions[j][k] && (stems[j].ytouch > stems[k].ytouch 
			? stems[j].ytouch - stems[k].ytouch <= stems[j].touchwidth * HIGHLY_COLLISION_FUZZ 
			: stems[k].ytouch - stems[j].ytouch <= stems[k].touchwidth * HIGHLY_COLLISION_FUZZ)
	}
	function spaceBelow(stems, transitions, k, bottom){
		var space = stems[k].ytouch - stems[k].touchwidth + bottom;
		for(var j = k - 1; j >= 0; j--){
			if(transitions[j][k] && Math.abs(stems[k].ytouch - stems[j].ytouch) - stems[k].touchwidth < space)
				space = stems[k].ytouch - stems[j].ytouch - stems[k].touchwidth
		}
		return space;
	}
	function spaceAbove(stems, transitions, k, top){
		var space = top - stems[k].ytouch;
		for(var j = k + 1; j < stems.length; j++){
			if(transitions[k][j] && Math.abs(stems[j].ytouch - stems[k].ytouch) - stems[j].touchwidth < space)
				space = stems[j].ytouch - stems[k].ytouch - stems[j].touchwidth
		}
		return space;
	}
	function canBeAdjustedUp(stems, transitions, k, distance){
		for(var j = k + 1; j < stems.length; j++){
			if(transitions[j][k] && Math.abs(stems[j].ytouch - stems[k].ytouch) - stems[j].touchwidth <= distance)
				return false
		}
		return true;
	}

	function adjustDownward(stems, transitions, k, bottom){
		var s = spaceBelow(stems, transitions, k, bottom);
		if(s >= 2 * uppx || s < 0.3 * uppx) {
			// There is enough space below stem k, just bring it downward
			if(stems[k].roundMethod === 1 && stems[k].ytouch > bottom) {
				roundDownStem(stems[k]);
				return true;
			}
		}
		for(var j = 0; j < k; j++){
			if(!adjustDownward(stems, transitions, j, bottom)) return false;
		}
		return false;
	}

	function atRadicalTop(stem){
		return !stem.hasSameRadicalStemAbove
			&& !(stem.hasRadicalPointAbove && stem.radicalCenterRise > STEM_CENTER_MIN_RISE)
			&& !(stem.hasRadicalLeftAdjacentPointAbove && stem.radicalLeftAdjacentRise > STEM_SIDE_MIN_RISE)
			&& !(stem.hasRadicalRightAdjacentPointAbove && stem.radicalRightAdjacentRise > STEM_SIDE_MIN_RISE)
	}
	function atGlyphTop(stem){
		return atRadicalTop(stem) && !stem.hasGlyphStemAbove
	}
	function atRadicalBottom(stem){
		return !stem.hasSameRadicalStemBelow
			&& !(stem.hasRadicalPointBelow && stem.radicalCenterDescent > STEM_CENTER_MIN_DESCENT)
			&& !(stem.hasRadicalLeftAdjacentPointBelow && stem.radicalLeftAdjacentDescent > STEM_SIDE_MIN_DESCENT)
			&& !(stem.hasRadicalRightAdjacentPointBelow && stem.radicalRightAdjacentDescent > STEM_SIDE_MIN_DESCENT)
	}
	function atGlyphBottom(stem){
		return atRadicalBottom(stem) && !stem.hasGlyphStemBelow
	}

	// Collision resolving
	function uncollide(stems){
		// In this procedure we move some segment stems to resolve collisions between them.
		// A "collision" means that two stems meet togther after gridfitting.
		// We will merge some of these stems to preserve the outfit of glyph while leaving
		// space between strokes;
		if(!stems.length) return;

		var transitions = [];
		for(var j = 0; j < stems.length; j++){
			transitions[j] = []
			for(var k = 0; k < stems.length; k++){
				transitions[j][k] = enoughOverlapBetweenStems(stems[j], stems[k])
			}
		}

		// Step 0a : Adjust bottom stems
		var ytouchmin0 = stems[0].ytouch;
		var ytouchmin = ytouchmin0;
		for(var j = 0; j < stems.length; j++) {
			if(!stems[j].hasRadicalPointBelow && !stems[j].hasGlyphStemBelow && stems[j].roundMethod === -1 && stems[j].ytouch === ytouchmin0 && stems[j].yori - stems[j].touchwidth >= -blueFuzz
				&& stems[j].yori - stems[j].ytouch >= 0.5 * uppx) {
				ytouchmin = ytouchmin0 + uppx;
				roundUpStem(stems[j])
			}
		}
		// Avoid stem merging at the bottom
		for(var j = 0; j < stems.length; j++) if(stems[j].ytouch === ytouchmin) for(var k = 0; k < j; k++) {
			if(transitions[j][k] && stems[j].roundMethod === -1) roundUpStem(stems[j]);
		}

		// Step 0b : Adjust top stems
		var ytouchmax = stems[stems.length - 1].ytouch;
		for(var j = stems.length - 1; j >= 0; j--) if(!stems[j].hasGlyphStemAbove) {
			var stem = stems[j]
			if(atGlyphTop(stem)) {
				var canAdjustUpToGlyphTop = stem.ytouch < glyfTop - blueFuzz && stem.ytouch >= glyfTop - uppx - 1;
				if(stem.roundMethod === -1 && stem.ytouch < glyfTop - blueFuzz && stem.yori - stem.ytouch >= 0.47 * uppx) {
					// Rounding-related upward adjustment
					roundUpStem(stem)
				} else if(canAdjustUpToGlyphTop && shouldAddGlyphHeight(stem, ppem, glyfTop, glyfBottom)) {
					// Strategy-based upward adjustment
					roundUpStem(stem);
				};
				stem.allowMoveUpward = stem.ytouch < glyfTop - blueFuzz;
			} else {
				if(stem.ytouch < glyfTop - blueFuzz - uppx && stem.yori - stem.ytouch >= 0.47 * uppx) roundUpStem(stem);
				stem.allowMoveUpward = stem.ytouch < glyfTop - uppx - blueFuzz
			}
		};

		var ytouchmin = Math.min.apply(Math, stems.map(function(s){ return s.ytouch }));
		var ytouchmax = Math.max.apply(Math, stems.map(function(s){ return s.ytouch }));

		// Step 1: Uncollide
		// We will perform stem movement using greedy method
		// Not always works but okay for most characters
		for(var j = 0; j < stems.length; j++){
			if(stems[j].ytouch <= ytouchmin) { 
				// Stems[j] is a bottom stem
				// DON'T MOVE IT
			} else if(stems[j].ytouch >= ytouchmax) {
				// Stems[j] is a top stem
				// It should not be moved, but we can uncollide stems below it.
				for(var k = j - 1; k >= 0; k--) if(collideWith(stems, transitions, j, k)) {
					if(highlyCollideWith(stems, transitions, j, k)) {
						alignStem(stems[k], stems[j])
						continue
					} 
					var r = adjustDownward(stems, transitions, k, ytouchmin)
					if(r) continue;
					if(stems[j].roundMethod === -1 && stems[j].allowMoveUpward) {
						roundUpStem(stems[j]);
						break;
					}
				}
			} else {
				// Stems[j] is a middle stem
				for(var k = j - 1; k >= 0; k--) if(collideWith(stems, transitions, j, k)) {
					if(highlyCollideWith(stems, transitions, j, k)) {
						alignStem(stems[j], stems[k])
						break;
					} 
					var r = adjustDownward(stems, transitions, k, ytouchmin);
					if(r) continue;
					if(!stems[j].atGlyphTop && stems[j].roundMethod === -1 && stems[j].ytouch < glyfTop - blueFuzz) {
						roundUpStem(stems[j]);
						break;
					}
				}			
			}
		};

		// Step 2 : Alignment cluster resolution
		// In this step we will resolve all alignment clusters and make the lowest stem the alignment basis
		var algClusters = []
		for(var j = 0; j < stems.length; j++){
			if(stems[j].alignTo) {
				var k = stems.indexOf(stems[j].alignTo);
				if(!algClusters[k]) algClusters[k] = {
					stems: [stems[k]]
				};
				algClusters[k].stems.push(stems[j])
			}
		};
		for(var j = 0; j < algClusters.length; j++) if(algClusters[j]) {
			var cluster = algClusters[j];
			cluster.stems = cluster.stems.sort(byyori);
		};
		algClusters = algClusters.filter(function(x){ return x && x.stems.length > 1 }).sort(function(a, b){ return a.stems[0].ytouch - b.stems[0].ytouch });

		// Step 3 : Alignment reduction
		// Step 3a : In this step we will move aligned stems two pixels upward there is enough space.
		for(var c = algClusters.length - 1; c >= 0; c--) {
			var cluster = algClusters[c];
			var last = cluster.stems[cluster.stems.length - 1]
			if(last.ytouch <= Math.min(ytouchmax - 1, glyfTop - 2 * uppx) && last.ytouch > ytouchmin
				&& canBeAdjustedUp(stems, transitions, stems.indexOf(last), 2.7 * uppx)) {
				// Cluster can be elimated.
				var last = cluster.stems[cluster.stems.length - 1]
				last.alignTo = null;
				roundUpStem2(last);
				cluster.stems = cluster.stems.slice(0, -1)
			}
		};
		algClusters = algClusters.filter(function(x){ return x && x.stems.length > 1 });
		// Step 3b : In this step we will move in-radical top stem alignments into cross-radical alignments
		for(var c = algClusters.length - 1; c >= 0; c--) {
			var cluster = algClusters[c];
			var first = cluster.stems[0];
			var last = cluster.stems[cluster.stems.length - 1];
			IN_RADICAL_ALIGNMENT_REDUCTION : {
					if(atRadicalTop(last) && last.belongRadical === first.belongRadical) {
					// Attempt 1 : find a cluster above it
					for(var d = c + 1; d < algClusters.length; d++) if(algClusters[d].stems[0].ytouch === last.ytouch + 2 * uppx) {
						cluster.stems = cluster.stems.slice(0, -1);
						algClusters[d].stems.push(last);
						break IN_RADICAL_ALIGNMENT_REDUCTION;
					}
					// Attempt 2 : find a stem above it and create a new cluster
					for(var k = stems.indexOf(last); k < stems.length; k++) if(stems[k].ytouch === last.ytouch + 2 * uppx) {
						var c = { stems: [stems[k], last] }
						algClusters.push(c);
						cluster.stems = cluster.stems.slice(0, -1);
						break IN_RADICAL_ALIGNMENT_REDUCTION;
					}
				}
			}
		};
		algClusters = algClusters.filter(function(x){ return x && x.stems.length > 1 }).sort(function(a, b){ return a.stems[0].ytouch - b.stems[0].ytouch });
		// Step 3c : In this step we will try to elimate same-width alignments
		for(var c = 0; c < algClusters.length; c++) if(algClusters[c].stems.length === 2) {
			var cluster = algClusters[c];
			var first = cluster.stems[0];
			var last = cluster.stems[cluster.stems.length - 1];
			SAME_WIDTH_ALIGNMENT_REDUCTION : if(first.xmin === last.xmin && first.xmax === last.xmax) {
				// We will find a proper cluster or stem to place either <first> or <last>
				for(var d = 0; d < c; d++) if(Math.abs(algClusters[d].stems[0].ytouch - first.ytouch - 2 * uppx) < 2) {
					cluster.stems = [];
					unalign(last);
					algClusters[d].stems.push(first);
					break SAME_WIDTH_ALIGNMENT_REDUCTION;
				};
				for(var k = stems.indexOf(first) - 1; k >= 0; k--) if(stems[k].ytouch === first.ytouch - 2 * uppx) {
					unalign(last);
					cluster.stems = [stems[k], first];
					break SAME_WIDTH_ALIGNMENT_REDUCTION;
				}
			}
		};		
		algClusters = algClusters.filter(function(x){ return x && x.stems.length > 1 }).sort(function(a, b){ return a.stems[0].ytouch - b.stems[0].ytouch });

		for(var j = 0; j < algClusters.length; j++) {
			var cluster = algClusters[j];
			unalign(cluster.stems[0]);
			for(var k = 1; k < cluster.stems.length; k++){
				alignStem(cluster.stems[k], cluster.stems[0])
			}
		};


		// Step 4 : Position Rebalance
		// Stems are rounded down by default, may cause improper movements
		// Therefore we bring them upward one pixel when there is enough space
		// above.
		for(var j = stems.length - 1; j >= 0; j--) if(!atGlyphTop(stems[j])) {
			if(canBeAdjustedUp(stems, transitions, j, 1.75 * uppx) && stems[j].yori - stems[j].ytouch > 0.5 * uppx) {
				if(stems[j].roundMethod === -1) { roundUpStem(stems[j]) }
			}
		}
		// Stem 5 : Stem Width Allocation
		// In this step we will adjust stem width when there is enough space below the stem.
		for(var j = stems.length - 1; j >= 0; j--) {
			var sb = spaceBelow(stems, transitions, j, ytouchmin + uppx * 3);
			var sa = spaceAbove(stems, transitions, j, ytouchmax + uppx * 3);
			var w = Math.round(Math.min(stems[j].touchwidth + sa + sb - 2 * uppx, calculateWidth(stems[j].width)) / uppx) * uppx;
			if(w <= uppx) continue;
			if(sb >= 1.75 * uppx && stems[j].ytouch - w >= glyfBottom - 1) {
				stems[j].touchwidth = w;
			} else if (sa > 1.6 * uppx && stems[j].roundMethod === -1 && stems[j].ytouch - w + uppx >= glyfBottom - 1 && stems[j].ytouch < glyfTop - uppx) {
				roundUpStem(stems[j]);
				stems[j].touchwidth = w
			}
		}
	}
	var instructions = {
		roundingStems : [],
		alignedStems : [],
		blueZoneAlignments: [],
		interpolations: []
	};
	// Touching procedure
	function touchStemPoints(stems){
		for(var j = 0; j < stems.length; j++){
			var stem = stems[j], w = stem.touchwidth;
			var topkey = null, bottomkey = null, topaligns = [], bottomaligns = [];
			// Top edge of a stem
			for(var k = 0; k < stem.high.length; k++) for(var p = 0; p < stem.high[k].length; p++) {
				if(p === 0) {
					stem.high[k][p].ytouch = stem.ytouch
					stem.high[k][p].touched = true;
					stem.high[k][p].keypoint = true;
					if(k === 0) {
						topkey = (['ROUND', stem.high[0][0], stem.yori, stem.ytouch])
					} else {
						topaligns.push(['ALIGN0', stem.high[0][0], stem.high[k][0]])
					}
				} else {
					stem.high[k][p].donttouch = true;
				}
			}
			for(var k = 0; k < stem.low.length; k++) for(var p = 0; p < stem.low[k].length; p++) {
				if(p === 0) {
					stem.low[k][p].ytouch = stem.ytouch - w;
					stem.low[k][p].touched = true;
					stem.low[k][p].keypoint = true;
					if(k === 0) {
						bottomkey = ['ALIGNW', stem.high[0][0], stem.low[0][0], stem.touchwidth / uppx]
					} else {
						bottomaligns.push(['ALIGN0', stem.low[0][0], stem.low[k][0]])
					}
				} else {
					stem.low[k][p].donttouch = true;
				}
			}
			instructions[topkey[0] === 'ALIGN0' ? 'alignedStems' : 'roundingStems'].push({
				topkey: topkey,
				bottomkey: bottomkey,
				topaligns: topaligns,
				bottomaligns: bottomaligns
			})
		}
	}

	function touchBlueZonePoints(contours) {
		function flushBottom(seq){
			var mink = 0;
			for(var s = 0; s < seq.length; s++) if(seq[s].yori < seq[mink].yori) mink = s;
			seq[mink].touched = true;
			seq[mink].ytouch = glyfBottom;
			seq[mink].keypoint = true;
			instructions.blueZoneAlignments.push(['BLUEBOTTOM', seq[mink], glyfBottom])
		}
		function flushTop(seq){
			var mink = 0;
			for(var s = 0; s < seq.length; s++) if(seq[s].yori > seq[mink].yori) mink = s;
			seq[mink].touched = true;
			seq[mink].ytouch = glyfTop;
			seq[mink].keypoint = true;
			instructions.blueZoneAlignments.push(['BLUETOP', seq[mink], glyfTop])
		}
		for(var j = 0; j < contours.length; j++) {
			var seq = []
			for(var k = 0; k < contours[j].points.length - 1; k++){
				var point = contours[j].points[k];
				if(point.ytouch <= -65){
					if(!point.touched && !point.donttouch && !point.interpolated) seq.push(point);
				} else if(seq.length){
					flushBottom(seq); seq = [];
				}
			}
			if(seq.length){
				flushBottom(seq); seq = [];
			}
			var seq = []
			for(var k = 0; k < contours[j].points.length - 1; k++){
				var point = contours[j].points[k];
				if(point.ytouch >= 825){
					if(!point.touched && !point.donttouch && !point.interpolated) seq.push(point);
				} else if(seq.length){
					flushTop(seq); seq = [];
				}
			}
			if(seq.length){
				flushTop(seq); seq = [];
			}
		}
	}
	function interpolate(a, b, c, touch){
		c.touched = touch;
		if(c.yori <= a.yori) c.ytouch = c.yori - a.yori + a.ytouch;
		else if(c.yori >= b.yori)  c.ytouch = c.yori - b.yori + b.ytouch;
		else c.ytouch = (c.yori - a.yori) / (b.yori - a.yori) * (b.ytouch - a.ytouch) + a.ytouch;
		if(touch) {
			instructions.interpolations.push(['IP', a, b, c])
		}
	}
	function interpolatedUntouchedTopBottomPoints(contours){
		var touchedPoints = [];
		for(var j = 0; j < contours.length; j++) for(var k = 0; k < contours[j].points.length; k++) if(contours[j].points[k].touched && contours[j].points.keypoint) {
			touchedPoints.push(contours[j].points[k]);
		}
		touchedPoints = touchedPoints.sort(function(p, q){ return p.yori - q.yori })
		out: for(var j = 0; j < contours.length; j++) { 
			var localtopp = null, localbottomp = null;
			for(var k = 0; k < contours[j].points.length; k++) {
				var point = contours[j].points[k];
				if(!localtopp || point.yori > localtopp.yori) localtopp = point;
				if(!localbottomp || point.yori < localbottomp.yori) localbottomp = point;
			}
			if(!localtopp.touched && !localtopp.donttouch) for(var k = 1; k < touchedPoints.length; k++) {
				if(touchedPoints[k].yori > localtopp.yori && touchedPoints[k - 1].yori <= localtopp.yori) {
					interpolate(touchedPoints[k], touchedPoints[k - 1], localtopp, true);
					break;
				}
			}
			if(!localbottomp.touched && !localbottomp.donttouch) for(var k = 1; k < touchedPoints.length; k++) {
				if(touchedPoints[k].yori > localbottomp.yori && touchedPoints[k - 1].yori <= localbottomp.yori) {
					interpolate(touchedPoints[k], touchedPoints[k - 1], localbottomp, true);
					break;
				}
			}
		}
	}
	// IUPy interpolates untouched points just like TT instructions.
	function IUPy(contours){
		for(var j = 0; j < contours.length; j++){
			var contour = contours[j];
			var k = 0;
			while(k < contour.points.length && !contour.points[k].touched) k++;
			if(contour.points[k]) {
				// Found a touched point in contour
				var kleft = k, k0 = k;
				var untoucheds = []
				for(var k = 0; k <= contour.points.length; k++){
					var ki = (k + k0) % contour.points.length;
					if(contour.points[ki].touched){
						var pleft = contour.points[kleft];
						var pright = contour.points[ki];
						var lower = pleft.yori < pright.yori ? pleft : pright
						var higher = pleft.yori < pright.yori ? pright : pleft
						for(var w = 0; w < untoucheds.length; w++) interpolate(lower, higher, untoucheds[w])
						untoucheds = []
						kleft = ki;
					} else {
						untoucheds.push(contour.points[ki])
					}
				}
			}
		}
	}

	function untouchAll(contours) {
		for(var j = 0; j < contours.length; j++) for(var k = 0; k < contours[j].points.length; k++) {
			contours[j].points[k].touched = false;
			contours[j].points[k].donttouch = false;
			contours[j].points[k].ytouch = contours[j].points[k].yori;
		}
	}

	untouchAll(contours);
	initStemTouches(stems, glyph.radicals);
	uncollide(stems);
	touchStemPoints(stems);
	touchBlueZonePoints(contours);
	interpolatedUntouchedTopBottomPoints(contours);
	IUPy(contours);
	touchBlueZonePoints(contours);
	interpolatedUntouchedTopBottomPoints(contours);
	IUPy(contours);
	
	return {
		contours: contours,
		instructions: instructions
	}

}

if(typeof exports !== 'undefined') {
	exports.parseSFD = parseSFD;
	exports.findStems = findStems;
	exports.autohint = autohint;
}