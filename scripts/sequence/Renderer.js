define([
	'core/ArrayUtilities',
	'svg/SVGUtilities',
	'svg/SVGTextBlock',
	'svg/SVGShapes',
], (
	array,
	svg,
	SVGTextBlock,
	SVGShapes
) => {
	'use strict';

	const SEP_ZERO = {left: 0, right: 0};

	function drawHorizontalArrowHead(container, {x, y, dx, dy, attrs}) {
		container.appendChild(svg.make(
			attrs.fill === 'none' ? 'polyline' : 'polygon',
			Object.assign({
				'points': (
					(x + dx) + ' ' + (y - dy) + ' ' +
					x + ' ' + y + ' ' +
					(x + dx) + ' ' + (y + dy)
				),
			}, attrs)
		));
	}

	function traverse(stages, callbacks) {
		stages.forEach((stage) => {
			if(stage.type === 'block') {
				const scope = {};
				if(callbacks.blockBeginFn) {
					callbacks.blockBeginFn(scope, stage);
				}
				stage.sections.forEach((section) => {
					if(callbacks.sectionBeginFn) {
						callbacks.sectionBeginFn(scope, stage, section);
					}
					traverse(section.stages, callbacks);
					if(callbacks.sectionEndFn) {
						callbacks.sectionEndFn(scope, stage, section);
					}
				});
				if(callbacks.blockEndFn) {
					callbacks.blockEndFn(scope, stage);
				}
			} else if(callbacks.stageFn) {
				callbacks.stageFn(stage);
			}
		});
	}

	return class Renderer {
		constructor(theme, {
			SVGTextBlockClass = SVGTextBlock,
		} = {}) {
			this.separationAgentCap = {
				'box': this.separationAgentCapBox.bind(this),
				'cross': this.separationAgentCapCross.bind(this),
				'bar': this.separationAgentCapBar.bind(this),
				'none': this.separationAgentCapNone.bind(this),
			};

			this.separationAction = {
				'mark': this.separationMark.bind(this),
				'async': this.separationAsync.bind(this),
				'agent begin': this.separationAgent.bind(this),
				'agent end': this.separationAgent.bind(this),
				'connection': this.separationConnection.bind(this),
				'note over': this.separationNoteOver.bind(this),
				'note left': this.separationNoteSide.bind(this, false),
				'note right': this.separationNoteSide.bind(this, true),
				'note between': this.separationNoteBetween.bind(this),
			};

			this.renderAgentCap = {
				'box': this.renderAgentCapBox.bind(this),
				'cross': this.renderAgentCapCross.bind(this),
				'bar': this.renderAgentCapBar.bind(this),
				'none': this.renderAgentCapNone.bind(this),
			};

			this.renderAction = {
				'mark': this.renderMark.bind(this),
				'async': this.renderAsync.bind(this),
				'agent begin': this.renderAgentBegin.bind(this),
				'agent end': this.renderAgentEnd.bind(this),
				'connection': this.renderConnection.bind(this),
				'note over': this.renderNoteOver.bind(this),
				'note left': this.renderNoteLeft.bind(this),
				'note right': this.renderNoteRight.bind(this),
				'note between': this.renderNoteBetween.bind(this),
			};

			this.separationTraversalFns = {
				stageFn: this.checkSeparation.bind(this),
				blockBeginFn: this.separationBlockBegin.bind(this),
				sectionBeginFn: this.separationSectionBegin.bind(this),
				blockEndFn: this.separationBlockEnd.bind(this),
			};

			this.renderTraversalFns = {
				stageFn: this.addAction.bind(this),
				blockBeginFn: this.renderBlockBegin.bind(this),
				sectionBeginFn: this.renderSectionBegin.bind(this),
				sectionEndFn: this.renderSectionEnd.bind(this),
				blockEndFn: this.renderBlockEnd.bind(this),
			};

			this.width = 0;
			this.height = 0;
			this.marks = new Map();
			this.theme = theme;
			this.SVGTextBlockClass = SVGTextBlockClass;
			this.currentSequence = null;
			this.buildStaticElements();
		}

		buildStaticElements() {
			this.base = svg.makeContainer({
				'width': '100%',
				'height': '100%',
			});

			this.agentLines = svg.make('g');
			this.mask = svg.make('g');
			this.blocks = svg.make('g');
			this.sections = svg.make('g');
			this.actionShapes = svg.make('g');
			this.actionLabels = svg.make('g');
			this.base.appendChild(this.agentLines);
			this.base.appendChild(this.mask);
			this.base.appendChild(this.blocks);
			this.base.appendChild(this.sections);
			this.base.appendChild(this.actionShapes);
			this.base.appendChild(this.actionLabels);
			this.title = new this.SVGTextBlockClass(this.base);

			this.sizer = new this.SVGTextBlockClass.SizeTester(this.base);
		}

		findExtremes(agentNames) {
			let min = null;
			let max = null;
			agentNames.forEach((name) => {
				const info = this.agentInfos.get(name);
				if(min === null || info.index < min.index) {
					min = info;
				}
				if(max === null || info.index > max.index) {
					max = info;
				}
			});
			return {
				left: min.label,
				right: max.label,
			};
		}

		addSeparation(agentName1, agentName2, dist) {
			const info1 = this.agentInfos.get(agentName1);
			const info2 = this.agentInfos.get(agentName2);

			const d1 = info1.separations.get(agentName2) || 0;
			info1.separations.set(agentName2, Math.max(d1, dist));

			const d2 = info2.separations.get(agentName1) || 0;
			info2.separations.set(agentName1, Math.max(d2, dist));
		}

		addSeparations(agentNames, agentSpaces) {
			agentNames.forEach((agentNameR) => {
				const infoR = this.agentInfos.get(agentNameR);
				const sepR = agentSpaces.get(agentNameR) || SEP_ZERO;
				infoR.maxRPad = Math.max(infoR.maxRPad, sepR.right);
				infoR.maxLPad = Math.max(infoR.maxLPad, sepR.left);
				agentNames.forEach((agentNameL) => {
					const infoL = this.agentInfos.get(agentNameL);
					if(infoL.index >= infoR.index) {
						return;
					}
					const sepL = agentSpaces.get(agentNameL) || SEP_ZERO;
					this.addSeparation(
						agentNameR,
						agentNameL,
						sepR.left + sepL.right + this.theme.agentMargin
					);
				});
			});
		}

		getArrowShort(arrow) {
			const h = arrow.height / 2;
			const w = arrow.width;
			const t = arrow.attrs['stroke-width'] * 0.5;
			const lineStroke = this.theme.agentLineAttrs['stroke-width'] * 0.5;
			const arrowDistance = t * Math.sqrt((w * w) / (h * h) + 1);
			return lineStroke + arrowDistance;
		}

		separationMark() {
		}

		separationAsync() {
		}

		separationAgentCapBox({label}) {
			const config = this.theme.agentCap.box;
			const width = (
				this.sizer.measure(config.labelAttrs, label).width +
				config.padding.left +
				config.padding.right
			);

			return {
				left: width / 2,
				right: width / 2,
			};
		}

		separationAgentCapCross() {
			const config = this.theme.agentCap.cross;
			return {
				left: config.size / 2,
				right: config.size / 2,
			};
		}

		separationAgentCapBar({label}) {
			const config = this.theme.agentCap.box;
			const width = (
				this.sizer.measure(config.labelAttrs, label).width +
				config.padding.left +
				config.padding.right
			);

			return {
				left: width / 2,
				right: width / 2,
			};
		}

		separationAgentCapNone() {
			return {left: 0, right: 0};
		}

		separationAgent({type, mode, agentNames}) {
			if(type === 'agent begin') {
				array.mergeSets(this.visibleAgents, agentNames);
			}

			const agentSpaces = new Map();
			agentNames.forEach((name) => {
				const info = this.agentInfos.get(name);
				const separationFn = this.separationAgentCap[mode];
				agentSpaces.set(name, separationFn(info));
			});
			this.addSeparations(this.visibleAgents, agentSpaces);

			if(type === 'agent end') {
				array.removeAll(this.visibleAgents, agentNames);
			}
		}

		separationConnection({agentNames, label}) {
			const config = this.theme.connect;

			const labelWidth = (
				this.sizer.measure(config.label.attrs, label).width +
				config.label.padding * 2
			);

			const short = this.getArrowShort(config.arrow);

			if(agentNames[0] === agentNames[1]) {
				const agentSpaces = new Map();
				agentSpaces.set(agentNames[0], {
					left: 0,
					right: (
						labelWidth +
						config.arrow.width +
						short +
						config.loopbackRadius
					),
				});
				this.addSeparations(this.visibleAgents, agentSpaces);
			} else {
				this.addSeparation(
					agentNames[0],
					agentNames[1],
					labelWidth + config.arrow.width * 2 + short * 2
				);
			}
		}

		separationNoteOver({agentNames, mode, label}) {
			const config = this.theme.note[mode];
			const width = (
				this.sizer.measure(config.labelAttrs, label).width +
				config.padding.left +
				config.padding.right
			);

			const agentSpaces = new Map();
			if(agentNames.length > 1) {
				const {left, right} = this.findExtremes(agentNames);

				this.addSeparation(
					left,
					right,

					width -
					config.overlap.left -
					config.overlap.right
				);

				agentSpaces.set(left, {left: config.overlap.left, right: 0});
				agentSpaces.set(right, {left: 0, right: config.overlap.right});
			} else {
				agentSpaces.set(agentNames[0], {
					left: width / 2,
					right: width / 2,
				});
			}
			this.addSeparations(this.visibleAgents, agentSpaces);
		}

		separationNoteSide(isRight, {agentNames, mode, label}) {
			const config = this.theme.note[mode];
			const {left, right} = this.findExtremes(agentNames);
			const width = (
				this.sizer.measure(config.labelAttrs, label).width +
				config.padding.left +
				config.padding.right +
				config.margin.left +
				config.margin.right
			);

			const agentSpaces = new Map();
			if(isRight) {
				agentSpaces.set(right, {left: 0, right: width});
			} else {
				agentSpaces.set(left, {left: width, right: 0});
			}
			this.addSeparations(this.visibleAgents, agentSpaces);
		}

		separationNoteBetween({agentNames, mode, label}) {
			const config = this.theme.note[mode];
			const {left, right} = this.findExtremes(agentNames);

			this.addSeparation(
				left,
				right,

				this.sizer.measure(config.labelAttrs, label).width +
				config.padding.left +
				config.padding.right +
				config.margin.left +
				config.margin.right
			);
		}

		separationBlockBegin(scope, {left, right}) {
			array.mergeSets(this.visibleAgents, [left, right]);
			this.addSeparations(this.visibleAgents, new Map());
		}

		separationSectionBegin(scope, {left, right}, {mode, label}) {
			const config = this.theme.block.section;
			const width = (
				this.sizer.measure(config.mode.labelAttrs, mode).width +
				config.mode.padding.left +
				config.mode.padding.right +
				this.sizer.measure(config.label.labelAttrs, label).width +
				config.label.padding.left +
				config.label.padding.right
			);
			this.addSeparation(left, right, width);
		}

		separationBlockEnd(scope, {left, right}) {
			array.removeAll(this.visibleAgents, [left, right]);
		}

		checkSeparation(stage) {
			this.separationAction[stage.type](stage);
		}

		renderMark({name}) {
			this.marks.set(name, this.currentY);
		}

		renderAsync({target}) {
			if(target) {
				this.currentY = this.marks.get(target) || 0;
			} else {
				this.currentY = 0;
			}
		}

		renderAgentCapBox({x, label}) {
			const config = this.theme.agentCap.box;
			const {height} = SVGShapes.renderBoxedText(label, {
				x,
				y: this.currentY,
				padding: config.padding,
				boxAttrs: config.boxAttrs,
				labelAttrs: config.labelAttrs,
				boxLayer: this.actionShapes,
				labelLayer: this.actionLabels,
				SVGTextBlockClass: this.SVGTextBlockClass,
			});

			return {
				lineTop: 0,
				lineBottom: height,
				height,
			};
		}

		renderAgentCapCross({x}) {
			const config = this.theme.agentCap.cross;
			const y = this.currentY;
			const d = config.size / 2;

			this.actionShapes.appendChild(svg.make('path', Object.assign({
				'd': (
					'M ' + (x - d) + ' ' + y +
					' L ' + (x + d) + ' ' + (y + d * 2) +
					' M ' + (x + d) + ' ' + y +
					' L ' + (x - d) + ' ' + (y + d * 2)
				),
			}, config.attrs)));

			return {
				lineTop: d,
				lineBottom: d,
				height: d * 2,
			};
		}

		renderAgentCapBar({x, label}) {
			const configB = this.theme.agentCap.box;
			const config = this.theme.agentCap.bar;
			const width = (
				this.sizer.measure(configB.labelAttrs, label).width +
				configB.padding.left +
				configB.padding.right
			);

			this.actionShapes.appendChild(svg.make('rect', Object.assign({
				'x': x - width / 2,
				'y': this.currentY,
				'width': width,
			}, config.attrs)));

			return {
				lineTop: 0,
				lineBottom: config.attrs.height,
				height: config.attrs.height,
			};
		}

		renderAgentCapNone() {
			const config = this.theme.agentCap.none;
			return {
				lineTop: config.height,
				lineBottom: 0,
				height: config.height,
			};
		}

		checkAgentRange(agentNames) {
			const {left, right} = this.findExtremes(agentNames);
			const leftX = this.agentInfos.get(left).x;
			const rightX = this.agentInfos.get(right).x;
			this.agentInfos.forEach((agentInfo) => {
				if(agentInfo.x >= leftX && agentInfo.x <= rightX) {
					this.currentY = Math.max(this.currentY, agentInfo.latestY);
				}
			});
		}

		markAgentRange(agentNames) {
			const {left, right} = this.findExtremes(agentNames);
			const leftX = this.agentInfos.get(left).x;
			const rightX = this.agentInfos.get(right).x;
			this.agentInfos.forEach((agentInfo) => {
				if(agentInfo.x >= leftX && agentInfo.x <= rightX) {
					agentInfo.latestY = this.currentY;
				}
			});
		}

		renderAgentBegin({mode, agentNames}) {
			this.checkAgentRange(agentNames);
			let maxHeight = 0;
			agentNames.forEach((name) => {
				const agentInfo = this.agentInfos.get(name);
				const shifts = this.renderAgentCap[mode](agentInfo);
				maxHeight = Math.max(maxHeight, shifts.height);
				agentInfo.latestYStart = this.currentY + shifts.lineBottom;
			});
			this.currentY += maxHeight + this.theme.actionMargin;
			this.markAgentRange(agentNames);
		}

		renderAgentEnd({mode, agentNames}) {
			this.checkAgentRange(agentNames);
			let maxHeight = 0;
			agentNames.forEach((name) => {
				const agentInfo = this.agentInfos.get(name);
				const x = agentInfo.x;
				const shifts = this.renderAgentCap[mode](agentInfo);
				maxHeight = Math.max(maxHeight, shifts.height);
				this.agentLines.appendChild(svg.make('line', Object.assign({
					'x1': x,
					'y1': agentInfo.latestYStart,
					'x2': x,
					'y2': this.currentY + shifts.lineTop,
					'class': 'agent-' + agentInfo.index + '-line',
				}, this.theme.agentLineAttrs)));
				agentInfo.latestYStart = null;
			});
			this.currentY += maxHeight + this.theme.actionMargin;
			this.markAgentRange(agentNames);
		}

		renderSelfConnection({label, agentNames, options}) {
			const config = this.theme.connect;
			const from = this.agentInfos.get(agentNames[0]);

			const dy = config.arrow.height / 2;
			const short = this.getArrowShort(config.arrow);

			const height = (
				this.sizer.measureHeight(config.label.attrs, label) +
				config.label.margin.top +
				config.label.margin.bottom
			);

			const y0 = this.currentY + Math.max(dy, height);
			const x0 = (
				from.x +
				short +
				config.arrow.width +
				config.label.padding
			);

			const renderedText = SVGShapes.renderBoxedText(label, {
				x: x0 - config.mask.padding.left,
				y: y0 - height + config.label.margin.top,
				padding: config.mask.padding,
				boxAttrs: config.mask.maskAttrs,
				labelAttrs: config.label.loopbackAttrs,
				boxLayer: this.mask,
				labelLayer: this.actionLabels,
				SVGTextBlockClass: this.SVGTextBlockClass,
			});
			const r = config.loopbackRadius;
			const x1 = (
				x0 +
				renderedText.width +
				config.label.padding -
				config.mask.padding.left -
				config.mask.padding.right
			);
			const y1 = y0 + r * 2;

			this.actionShapes.appendChild(svg.make('path', Object.assign({
				'd': (
					'M ' + (from.x + (options.left ? short : 0)) + ' ' + y0 +
					' L ' + x1 + ' ' + y0 +
					' A ' + r + ' ' + r + ' 0 0 1 ' + x1 + ' ' + y1 +
					' L ' + (from.x + (options.right ? short : 0)) + ' ' + y1
				),
			}, config.lineAttrs[options.line])));

			if(options.left) {
				drawHorizontalArrowHead(this.actionShapes, {
					x: from.x + short,
					y: y0,
					dx: config.arrow.width,
					dy,
					attrs: config.arrow.attrs,
				});
			}

			if(options.right) {
				drawHorizontalArrowHead(this.actionShapes, {
					x: from.x + short,
					y: y1,
					dx: config.arrow.width,
					dy,
					attrs: config.arrow.attrs,
				});
			}

			this.currentY = y1 + dy + this.theme.actionMargin;
		}

		renderSimpleConnection({label, agentNames, options}) {
			const config = this.theme.connect;
			const from = this.agentInfos.get(agentNames[0]);
			const to = this.agentInfos.get(agentNames[1]);

			const dy = config.arrow.height / 2;
			const dir = (from.x < to.x) ? 1 : -1;
			const short = this.getArrowShort(config.arrow);

			const height = (
				this.sizer.measureHeight(config.label.attrs, label) +
				config.label.margin.top +
				config.label.margin.bottom
			);

			let y = this.currentY + Math.max(dy, height);

			SVGShapes.renderBoxedText(label, {
				x: (from.x + to.x) / 2,
				y: y - height + config.label.margin.top,
				padding: config.mask.padding,
				boxAttrs: config.mask.maskAttrs,
				labelAttrs: config.label.attrs,
				boxLayer: this.mask,
				labelLayer: this.actionLabels,
				SVGTextBlockClass: this.SVGTextBlockClass,
			});

			this.actionShapes.appendChild(svg.make('line', Object.assign({
				'x1': from.x + (options.left ? short : 0) * dir,
				'y1': y,
				'x2': to.x - (options.right ? short : 0) * dir,
				'y2': y,
			}, config.lineAttrs[options.line])));

			if(options.left) {
				drawHorizontalArrowHead(this.actionShapes, {
					x: from.x + short * dir,
					y,
					dx: config.arrow.width * dir,
					dy,
					attrs: config.arrow.attrs,
				});
			}

			if(options.right) {
				drawHorizontalArrowHead(this.actionShapes, {
					x: to.x - short * dir,
					y,
					dx: -config.arrow.width * dir,
					dy,
					attrs: config.arrow.attrs,
				});
			}

			this.currentY = y + dy + this.theme.actionMargin;
		}

		renderConnection(stage) {
			this.checkAgentRange(stage.agentNames);
			if(stage.agentNames[0] === stage.agentNames[1]) {
				this.renderSelfConnection(stage);
			} else {
				this.renderSimpleConnection(stage);
			}
			this.markAgentRange(stage.agentNames);
		}

		renderNote({xMid = null, x0 = null, x1 = null}, anchor, mode, label) {
			const config = this.theme.note[mode];

			this.currentY += config.margin.top;

			const y = this.currentY + config.padding.top;
			const labelNode = new this.SVGTextBlockClass(this.actionLabels, {
				attrs: config.labelAttrs,
				text: label,
				y,
			});

			const fullW = (
				labelNode.width +
				config.padding.left +
				config.padding.right
			);
			const fullH = (
				config.padding.top +
				labelNode.height +
				config.padding.bottom
			);
			if(x0 === null && xMid !== null) {
				x0 = xMid - fullW / 2;
			}
			if(x1 === null && x0 !== null) {
				x1 = x0 + fullW;
			} else if(x0 === null) {
				x0 = x1 - fullW;
			}
			switch(config.labelAttrs['text-anchor']) {
			case 'middle':
				labelNode.set({
					x: (
						x0 + config.padding.left +
						x1 - config.padding.right
					) / 2,
					y,
				});
				break;
			case 'end':
				labelNode.set({x: x1 - config.padding.right, y});
				break;
			default:
				labelNode.set({x: x0 + config.padding.left, y});
				break;
			}

			this.actionShapes.appendChild(config.boxRenderer({
				x: x0,
				y: this.currentY,
				width: x1 - x0,
				height: fullH,
			}));

			this.currentY += (
				fullH +
				config.margin.bottom +
				this.theme.actionMargin
			);
		}

		renderNoteOver({agentNames, mode, label}) {
			this.checkAgentRange(agentNames);
			const config = this.theme.note[mode];

			if(agentNames.length > 1) {
				const {left, right} = this.findExtremes(agentNames);
				this.renderNote({
					x0: this.agentInfos.get(left).x - config.overlap.left,
					x1: this.agentInfos.get(right).x + config.overlap.right,
				}, 'middle', mode, label);
			} else {
				const xMid = this.agentInfos.get(agentNames[0]).x;
				this.renderNote({xMid}, 'middle', mode, label);
			}
			this.markAgentRange(agentNames);
		}

		renderNoteLeft({agentNames, mode, label}) {
			this.checkAgentRange(agentNames);
			const config = this.theme.note[mode];

			const {left} = this.findExtremes(agentNames);
			const x1 = this.agentInfos.get(left).x - config.margin.right;
			this.renderNote({x1}, 'end', mode, label);
			this.markAgentRange(agentNames);
		}

		renderNoteRight({agentNames, mode, label}) {
			this.checkAgentRange(agentNames);
			const config = this.theme.note[mode];

			const {right} = this.findExtremes(agentNames);
			const x0 = this.agentInfos.get(right).x + config.margin.left;
			this.renderNote({x0}, 'start', mode, label);
			this.markAgentRange(agentNames);
		}

		renderNoteBetween({agentNames, mode, label}) {
			this.checkAgentRange(agentNames);
			const {left, right} = this.findExtremes(agentNames);
			const xMid = (
				this.agentInfos.get(left).x +
				this.agentInfos.get(right).x
			) / 2;

			this.renderNote({xMid}, 'middle', mode, label);
			this.markAgentRange(agentNames);
		}

		renderBlockBegin(scope, {left, right}) {
			this.checkAgentRange([left, right]);
			this.currentY += this.theme.block.margin.top;

			scope.y = this.currentY;
			scope.first = true;
			this.markAgentRange([left, right]);
		}

		renderSectionBegin(scope, {left, right}, {mode, label}) {
			this.checkAgentRange([left, right]);
			const config = this.theme.block;
			const agentInfoL = this.agentInfos.get(left);
			const agentInfoR = this.agentInfos.get(right);

			if(scope.first) {
				scope.first = false;
			} else {
				this.currentY += config.section.padding.bottom;
				this.sections.appendChild(svg.make('line', Object.assign({
					'x1': agentInfoL.x,
					'y1': this.currentY,
					'x2': agentInfoR.x,
					'y2': this.currentY,
				}, config.separator.attrs)));
			}

			const modeRender = SVGShapes.renderBoxedText(mode, {
				x: agentInfoL.x,
				y: this.currentY,
				padding: config.section.mode.padding,
				boxAttrs: config.section.mode.boxAttrs,
				labelAttrs: config.section.mode.labelAttrs,
				boxLayer: this.blocks,
				labelLayer: this.actionLabels,
				SVGTextBlockClass: this.SVGTextBlockClass,
			});

			const labelRender = SVGShapes.renderBoxedText(label, {
				x: agentInfoL.x + modeRender.width,
				y: this.currentY,
				padding: config.section.label.padding,
				boxAttrs: config.section.label.maskAttrs,
				labelAttrs: config.section.label.labelAttrs,
				boxLayer: this.mask,
				labelLayer: this.actionLabels,
				SVGTextBlockClass: this.SVGTextBlockClass,
			});

			this.currentY += (
				Math.max(modeRender.height, labelRender.height) +
				config.section.padding.top
			);
			this.markAgentRange([left, right]);
		}

		renderSectionEnd(/*scope, block, section*/) {
		}

		renderBlockEnd(scope, {left, right}) {
			this.checkAgentRange([left, right]);
			const config = this.theme.block;
			this.currentY += config.section.padding.bottom;

			const agentInfoL = this.agentInfos.get(left);
			const agentInfoR = this.agentInfos.get(right);
			this.blocks.appendChild(svg.make('rect', Object.assign({
				'x': agentInfoL.x,
				'y': scope.y,
				'width': agentInfoR.x - agentInfoL.x,
				'height': this.currentY - scope.y,
			}, config.boxAttrs)));

			this.currentY += config.margin.bottom + this.theme.actionMargin;
			this.markAgentRange([left, right]);
		}

		addAction(stage) {
			this.renderAction[stage.type](stage);
		}

		positionAgents() {
			// Map guarantees insertion-order iteration
			const orderedInfos = [];
			this.agentInfos.forEach((agentInfo) => {
				let currentX = 0;
				agentInfo.separations.forEach((dist, otherAgent) => {
					const otherAgentInfo = this.agentInfos.get(otherAgent);
					if(otherAgentInfo.index < agentInfo.index) {
						currentX = Math.max(currentX, otherAgentInfo.x + dist);
					}
				});
				agentInfo.x = currentX;
				orderedInfos.push(agentInfo);
			});

			let previousInfo = {x: 0};
			orderedInfos.reverse().forEach((agentInfo) => {
				let currentX = previousInfo.x;
				previousInfo = agentInfo;
				if(!agentInfo.anchorRight) {
					return;
				}
				agentInfo.separations.forEach((dist, otherAgent) => {
					const otherAgentInfo = this.agentInfos.get(otherAgent);
					if(otherAgentInfo.index > agentInfo.index) {
						currentX = Math.min(currentX, otherAgentInfo.x - dist);
					}
				});
				agentInfo.x = currentX;
			});

			this.agentInfos.forEach(({label, x, maxRPad, maxLPad}) => {
				this.minX = Math.min(this.minX, x - maxLPad);
				this.maxX = Math.max(this.maxX, x + maxRPad);
			});
		}

		buildAgentInfos(agents, stages) {
			this.agentInfos = new Map();
			agents.forEach((agent, index) => {
				this.agentInfos.set(agent.name, {
					label: agent.name,
					anchorRight: agent.anchorRight,
					index,
					x: null,
					latestYStart: null,
					latestY: 0,
					maxRPad: 0,
					maxLPad: 0,
					separations: new Map(),
				});
			});

			this.visibleAgents = ['[', ']'];
			traverse(stages, this.separationTraversalFns);

			this.positionAgents();
		}

		updateBounds(stagesHeight) {
			const cx = (this.minX + this.maxX) / 2;
			const titleY = ((this.title.height > 0) ?
				(-this.theme.titleMargin - this.title.height) : 0
			);
			this.title.set({x: cx, y: titleY});

			const halfTitleWidth = this.title.width / 2;
			const margin = this.theme.outerMargin;
			const x0 = Math.min(this.minX, cx - halfTitleWidth) - margin;
			const x1 = Math.max(this.maxX, cx + halfTitleWidth) + margin;
			const y0 = titleY - margin;
			const y1 = stagesHeight + margin;

			this.base.setAttribute('viewBox', (
				x0 + ' ' + y0 + ' ' +
				(x1 - x0) + ' ' + (y1 - y0)
			));
			this.width = (x1 - x0);
			this.height = (y1 - y0);
		}

		setTheme(theme) {
			if(this.theme === theme) {
				return;
			}
			this.theme = theme;
			if(this.currentSequence) {
				this.render(this.currentSequence);
			}
		}

		render(sequence) {
			svg.empty(this.agentLines);
			svg.empty(this.mask);
			svg.empty(this.blocks);
			svg.empty(this.sections);
			svg.empty(this.actionShapes);
			svg.empty(this.actionLabels);
			this.marks.clear();

			this.title.set({
				attrs: this.theme.titleAttrs,
				text: sequence.meta.title,
			});

			this.minX = 0;
			this.maxX = 0;
			this.buildAgentInfos(sequence.agents, sequence.stages);

			this.currentY = 0;
			traverse(sequence.stages, this.renderTraversalFns);
			this.checkAgentRange(['[', ']']);

			const stagesHeight = Math.max(
				this.currentY - this.theme.actionMargin,
				0
			);
			this.updateBounds(stagesHeight);

			this.sizer.resetCache();
			this.sizer.detach();
			this.currentSequence = sequence;
		}

		getAgentX(name) {
			return this.agentInfos.get(name).x;
		}

		svg() {
			return this.base;
		}
	};
});
