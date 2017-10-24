defineDescribe('Interface', ['./Interface'], (Interface) => {
	'use strict';

	let parser = null;
	let generator = null;
	let renderer = null;
	let container = null;
	let ui = null;

	beforeEach(() => {
		parser = jasmine.createSpyObj('parser', ['parse']);
		parser.parse.and.returnValue({
			meta: {},
			stages: [],
		});
		generator = jasmine.createSpyObj('generator', ['generate']);
		generator.generate.and.returnValue({
			meta: {},
			agents: [],
			stages: [],
		});
		renderer = jasmine.createSpyObj('renderer', ['render', 'svg']);
		renderer.svg.and.returnValue(document.createElement('svg'));
		container = jasmine.createSpyObj('container', ['appendChild']);
		ui = new Interface({
			parser,
			generator,
			renderer,
			defaultCode: 'my default code',
		});
	});

	describe('build', () => {
		it('adds elements to the given container', () => {
			ui.build(container);
			expect(container.appendChild).toHaveBeenCalled();
		});

		it('creates a code mirror instance with the given code', () => {
			ui.build(container);
			const constructorArgs = ui.code.constructor;
			expect(constructorArgs.options.value).toEqual('my default code');
		});
	});

	describe('download SVG', () => {
		it('triggers a download of the current image in SVG format', () => {
			ui.build(container);
			expect(ui.downloadSVG.getAttribute('href')).toEqual('#');
			ui.downloadSVG.dispatchEvent(new Event('click'));
			expect(ui.downloadSVG.getAttribute('href')).not.toEqual('#');
		});
	});
});