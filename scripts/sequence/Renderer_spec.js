defineDescribe('Sequence Renderer', [
	'./Renderer',
	'./themes/Basic',
], (
	Renderer,
	Theme
) => {
	'use strict';

	let renderer = null;

	beforeEach(() => {
		renderer = new Renderer(new Theme());
		document.body.appendChild(renderer.svg());
	});

	afterEach(() => {
		document.body.removeChild(renderer.svg());
	});

	describe('.svg', () => {
		it('returns an SVG node containing the rendered diagram', () => {
			const svg = renderer.svg();
			expect(svg.tagName).toEqual('svg');
		});
	});

	function connectionStage(agentNames, label = '') {
		return {
			type: 'connection',
			agentNames,
			label,
			options: {
				line: 'solid',
				left: false,
				right: true,
			},
		};
	}

	describe('.render', () => {
		it('populates the SVG with content', () => {
			renderer.render({
				meta: {title: 'Title'},
				agents: [
					{name: '[', anchorRight: true},
					{name: 'Col 1', anchorRight: false},
					{name: 'Col 2', anchorRight: false},
					{name: ']', anchorRight: false},
				],
				stages: [],
			});
			const element = renderer.svg();
			const title = element.getElementsByClassName('title')[0];
			expect(title.innerHTML).toEqual('Title');
		});

		it('positions agent lines', () => {
			/*
				A -> B
			*/

			renderer.render({
				meta: {title: ''},
				agents: [
					{name: '[', anchorRight: true},
					{name: 'A', anchorRight: false},
					{name: 'B', anchorRight: false},
					{name: ']', anchorRight: false},
				],
				stages: [
					{type: 'agent begin', agentNames: ['A', 'B'], mode: 'box'},
					connectionStage(['A', 'B']),
					{type: 'agent end', agentNames: ['A', 'B'], mode: 'none'},
				],
			});

			const element = renderer.svg();
			const line = element.getElementsByClassName('agent-1-line')[0];
			const drawnX = Number(line.getAttribute('x1'));

			expect(drawnX).toEqual(renderer.getAgentX('A'));
		});

		it('arranges agents left-to-right', () => {
			/*
				[ -> A
				A -> B
				B -> C
				C -> ]
			*/

			renderer.render({
				meta: {title: ''},
				agents: [
					{name: '[', anchorRight: true},
					{name: 'A', anchorRight: false},
					{name: 'B', anchorRight: false},
					{name: 'C', anchorRight: false},
					{name: ']', anchorRight: false},
				],
				stages: [
					{
						type: 'agent begin',
						agentNames: ['A', 'B', 'C'],
						mode: 'box',
					},
					connectionStage(['[', 'A']),
					connectionStage(['A', 'B']),
					connectionStage(['B', 'C']),
					connectionStage(['C', ']']),
					{
						type: 'agent end',
						agentNames: ['A', 'B', 'C'],
						mode: 'none',
					},
				],
			});

			const xL = renderer.getAgentX('[');
			const xA = renderer.getAgentX('A');
			const xB = renderer.getAgentX('B');
			const xC = renderer.getAgentX('C');
			const xR = renderer.getAgentX(']');

			expect(xA).toBeGreaterThan(xL);
			expect(xB).toBeGreaterThan(xA);
			expect(xC).toBeGreaterThan(xB);
			expect(xR).toBeGreaterThan(xC);
		});

		it('allows agent reordering for mutually-exclusive agents', () => {
			/*
				A -> B: short
				end B
				A -> C: long description here
				end C
				A -> D: short again
				end A, D
			*/

			renderer.render({
				meta: {title: ''},
				agents: [
					{name: '[', anchorRight: true},
					{name: 'A', anchorRight: false},
					{name: 'B', anchorRight: false},
					{name: 'C', anchorRight: false},
					{name: 'D', anchorRight: false},
					{name: ']', anchorRight: false},
				],
				stages: [
					{type: 'agent begin', agentNames: ['A', 'B'], mode: 'box'},
					connectionStage(['A', 'B'], 'short'),
					{type: 'agent end', agentNames: ['B'], mode: 'cross'},
					{type: 'agent begin', agentNames: ['C'], mode: 'box'},
					connectionStage(['A', 'C'], 'long description here'),
					{type: 'agent end', agentNames: ['C'], mode: 'cross'},
					{type: 'agent begin', agentNames: ['D'], mode: 'box'},
					connectionStage(['A', 'D'], 'short again'),
					{type: 'agent end', agentNames: ['A', 'D'], mode: 'cross'},
				],
			});

			const xA = renderer.getAgentX('A');
			const xB = renderer.getAgentX('B');
			const xC = renderer.getAgentX('C');
			const xD = renderer.getAgentX('D');

			expect(xB).toBeGreaterThan(xA);
			expect(xC).toBeGreaterThan(xA);
			expect(xD).toBeGreaterThan(xA);

			expect(xC).toBeGreaterThan(xB);
			expect(xD).toBeGreaterThan(xB);

			expect(xD).toBeLessThan(xC);
		});
	});
});
