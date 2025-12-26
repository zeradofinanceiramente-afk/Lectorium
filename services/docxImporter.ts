
import JSZip from 'jszip';
import { PageSettings } from '../components/doc/modals/PageSetupModal';
import { CommentData } from '../components/doc/CommentsSidebar';
import { Reference } from '../types';
import { parseDocument } from './docx/documentParser';
import { parseStyles } from './docx/stylesParser';
import { parseXml } from './docx/utils';

// --- TYPES ---
interface DocxImportResult {
  html: string;      // Deprecated in favor of direct JSON, kept for interface compat if needed
  chunks: string[];  // Unused in JSON mode but kept for compat
  comments: CommentData[];
  settings?: PageSettings;
  originalZip: JSZip; 
  references?: Reference[];
  // NEW: Direct JSON Output
  tiptapJson?: any; 
}

// --- 1. EXTRACT RELATIONSHIPS (.rels) ---
// Maps rId -> target (e.g. rId4 -> media/image1.png)
const extractRelationships = async (zip: JSZip): Promise<Record<string, string>> => {
    const relsFile = zip.file("word/_rels/document.xml.rels");
    if (!relsFile) return {};
    const xml = await relsFile.async("string");
    const doc = parseXml(xml);
    const rels: Record<string, string> = {};
    const nodes = doc.getElementsByTagName("Relationship");
    
    for (let i = 0; i < nodes.length; i++) {
        const id = nodes[i].getAttribute("Id");
        const target = nodes[i].getAttribute("Target");
        if (id && target) rels[id] = target;
    }
    return rels;
};

// --- 2. EXTRACT COMMENTS ---
const extractCommentsData = async (zip: JSZip): Promise<CommentData[]> => {
    const commentsFile = zip.file("word/comments.xml");
    if (!commentsFile) return [];

    const xmlText = await commentsFile.async("string");
    const doc = parseXml(xmlText);
    const commentNodes = doc.getElementsByTagName("w:comment");
    
    const comments: CommentData[] = [];

    for (let i = 0; i < commentNodes.length; i++) {
        const node = commentNodes[i];
        const id = node.getAttribute("w:id");
        const author = node.getAttribute("w:author") || "Desconhecido";
        const date = node.getAttribute("w:date") || new Date().toISOString();
        
        let text = "";
        const paragraphs = node.getElementsByTagName("w:p");
        for (let j = 0; j < paragraphs.length; j++) {
            text += paragraphs[j].textContent + "\n";
        }

        if (id && text.trim()) {
            comments.push({
                id: id,
                text: text.trim(),
                author: author,
                createdAt: date,
                selectedText: "" 
            });
        }
    }
    return comments;
};

// --- MAIN FUNCTION ---
export const processDocxForImport = async (fileBlob: Blob): Promise<DocxImportResult> => {
    // 1. Unzip
    const zip = await JSZip.loadAsync(fileBlob);

    // 2. Load Helpers
    const stylesXml = await zip.file("word/styles.xml")?.async("string");
    const styles = stylesXml ? await parseStyles(stylesXml) : {};
    
    const rels = await extractRelationships(zip);
    const comments = await extractCommentsData(zip);

    // 3. Parse Main Document
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (!docXml) throw new Error("Arquivo DOCX inválido (word/document.xml ausente).");

    const { content, settings } = await parseDocument(docXml, {
        zip,
        styles,
        commentsMap: {}, // No longer critical as we map IDs directly, but kept for context if needed
        relsMap: rels,
        activeCommentIds: new Set() // Initialize the active comments set
    });

    const tiptapJson = {
        type: 'doc',
        content: content
    };

    return {
        html: '', // No longer using HTML string
        chunks: [], 
        tiptapJson, // The new Gold Standard
        comments,
        settings,
        originalZip: zip 
    };
};
