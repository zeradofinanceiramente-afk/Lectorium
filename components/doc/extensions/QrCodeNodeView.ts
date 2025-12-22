
import { Node } from '@tiptap/pm/model';
import { EditorView, NodeView } from '@tiptap/pm/view';
import QRCode from 'qrcode';

export class QrCodeNodeView implements NodeView {
  dom: HTMLElement;
  node: Node;
  view: EditorView;
  getPos: () => number;
  canvas: HTMLCanvasElement;

  constructor(node: Node, view: EditorView, getPos: () => number) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('div');
    this.dom.classList.add('qrcode-node', 'inline-flex', 'flex-col', 'items-center', 'mx-2', 'p-2', 'cursor-pointer', 'border', 'border-transparent', 'hover:border-gray-300', 'rounded');
    this.dom.title = "Clique para editar QR Code";

    this.canvas = document.createElement('canvas');
    this.canvas.classList.add('rounded');
    this.dom.appendChild(this.canvas);

    this.dom.addEventListener('click', (e) => this.handleClick(e));

    this.render();
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  handleClick(e: MouseEvent) {
    e.stopPropagation();
    const currentVal = this.node.attrs.value;
    const newVal = prompt('Conteúdo do QR Code:', currentVal);
    
    if (newVal !== null && newVal !== currentVal) {
        const tr = this.view.state.tr.setNodeMarkup(this.getPos(), undefined, {
            ...this.node.attrs,
            value: newVal
        });
        this.view.dispatch(tr);
    }
  }

  render() {
    const value = this.node.attrs.value || 'https://';
    QRCode.toCanvas(this.canvas, value, {
        width: 120,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' }
    }, (error) => {
        if (error) console.error(error);
    });
  }

  ignoreMutation() {
    return true;
  }
}
