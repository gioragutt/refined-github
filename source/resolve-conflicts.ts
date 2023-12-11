/* eslint-disable @typescript-eslint/consistent-type-definitions -- Declaration merging necessary */

import regexJoin from 'regex-join';
import type CodeMirror from 'codemirror';

declare module 'codemirror' {
	interface LineHandle {
		widgets: unknown[];
		lineNo: () => number;
	}
}

const editor = document.querySelector<Element & {CodeMirror: CodeMirror.Editor}>('.CodeMirror')!.CodeMirror;

// Event fired when each file is loaded
editor.on('swapDoc', () => setTimeout(addWidget, 1));

// Restore widget on undo
editor.on('changes', (_, [firstChange]) => {
	if (firstChange.origin === 'undo' && firstChange.text[0].startsWith('<<<<<<<')) {
		addWidget();

		// Reset cursor position to one line instead of multiple
		editor.setCursor(editor.getCursor());
	}
});

function getLineNumber(lineChild: Element): number {
	return Number(
		lineChild
			.closest('.CodeMirror-gutter-wrapper, .CodeMirror-linewidget')!
			.parentElement!
			.querySelector('.CodeMirror-linenumber')!
			.textContent,
	) - 1;
}

function appendLineInfo(lineHandle: CodeMirror.LineHandle, text: string): void {
	// Only append text if it's not already there
	if (!lineHandle.text.includes(text)) {
		const line = lineHandle.lineNo();
		editor.replaceRange(text, {line, ch: Number.POSITIVE_INFINITY}); // Infinity = end of line
		editor.clearHistory();
	}
}

// Create and add widget if not already in the document
function addWidget(): void {
	editor.eachLine(lineHandle => {
		if (Array.isArray(lineHandle.widgets) && lineHandle.widgets.length > 0) {
			return;
		}

		if (lineHandle.text.startsWith('<<<<<<<')) {
			appendLineInfo(lineHandle, ' -- Incoming Change');
			const line = lineHandle.lineNo();
			editor.addLineClass(line, '', 'rgh-resolve-conflicts');
			editor.addLineWidget(line, newWidget(), {
				above: true,
				noHScroll: true,
			});
		} else if (lineHandle.text.startsWith('>>>>>>>')) {
			appendLineInfo(lineHandle, ' -- Current Change');
		}
	});
}

function createButton(branch: string, title = `Accept ${branch} Change`): HTMLButtonElement {
	const link = document.createElement('button');
	link.type = 'button';
	link.className = 'btn-link';
	link.textContent = title;
	link.addEventListener('click', ({target}) => {
		acceptBranch(branch, getLineNumber(target as Element));
	});
	return link;
}

// Create and return conflict resolve widget for specific conflict
function newWidget(): HTMLDivElement {
	const widget = document.createElement('div');
	widget.style.fontWeight = 'bold';
	widget.append(
		createButton('Current'),
		' | ',
		createButton('Incoming'),
		' | ',
		createButton('Both', 'Accept Both Changes'),
	);
	return widget;
}

const currentChange = /^>>>>>>> .+ -- Current Change$/;
const incomingChange = /^<<<<<<< .+ -- Incoming Change$/;
const anyMarker = regexJoin(currentChange, /|/, incomingChange, /|^=======$/);

// Accept one or both of branches and remove unnecessary lines
function acceptBranch(branch: string, line: number): void {
	// This variable is only changed when a marker is encountered and is meant to stay positive/negative until the next marker
	let inDeletableSection = false;

	const linesToRemove: number[] = [];
	editor.eachLine(line, Number.POSITIVE_INFINITY, lineHandle => {
		const currentLine = lineHandle.text;

		// Determine whether to remove the following line(s)
		if (incomingChange.test(currentLine)) {
			inDeletableSection = branch === 'Current';
		} else if (currentLine === '=======') {
			inDeletableSection = branch === 'Incoming';
		}

		// Delete tracked lines and all conflict markers
		if (inDeletableSection || anyMarker.test(currentLine)) {
			linesToRemove.push(lineHandle.lineNo());
		}

		return currentChange.test(currentLine); // `true` ends loop
	});

	// Delete all lines at once in a performant way
	const ranges = linesToRemove.map(line => ({
		anchor: {line, ch: 0},
		head: {line, ch: 0},
	}));
	editor.setSelections(ranges);
	editor.execCommand('deleteLine');
	editor.setCursor(linesToRemove[0]);
}

