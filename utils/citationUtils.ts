
import { Reference } from "../types";

// Format author list for inline citation: (SILVA, 2023) or (SILVA; SOUZA, 2023)
export const formatInlineCitation = (ref: Reference): string => {
  const authors = ref.authors.map(a => a.lastName.toUpperCase()).join('; ');
  return `(${authors || 'AUTOR'}, ${ref.year})`;
};

// Format author list for bibliography: SILVA, João.
export const formatBibAuthors = (authors: { firstName: string; lastName: string }[]): string => {
  if (authors.length === 0) return "AUTOR DESCONHECIDO.";
  
  if (authors.length > 3) {
    // ABNT rule for >3 authors: First author + et al.
    const first = authors[0];
    return `${first.lastName.toUpperCase()}, ${first.firstName}. et al.`;
  }

  return authors.map(a => `${a.lastName.toUpperCase()}, ${a.firstName}.`).join('; ');
};

// Format full bibliography entry (ABNT)
export const formatBibliographyEntry = (ref: Reference): string => {
  const authors = formatBibAuthors(ref.authors);
  
  // Basic cleaning
  const title = ref.title.trim();
  // We can't apply bold here directly as this returns a string, rendering handles style.
  // We expect the renderer to handle title formatting or we use markdown-like syntax if needed.
  
  let details = "";

  switch (ref.type) {
    case 'book':
      // SILVA, J. Título: subtítulo. Edição. Cidade: Editora, Ano.
      details = `${ref.city || 'S.l.'}: ${ref.publisher || 's.n.'}, ${ref.year}.`;
      break;
    case 'article':
      // SILVA, J. Título do artigo. Nome do Periódico, Cidade, v. 1, n. 1, p. 1-10, ano.
      details = `${ref.journal || 'Periódico'}, ${ref.city ? ref.city + ', ' : ''}v. ${ref.volume || 's.v.'}, n. ${ref.issue || 's.n.'}, p. ${ref.pages || 's.p.'}, ${ref.year}.`;
      break;
    case 'website':
      // SILVA, J. Título. Disponível em: <url>. Acesso em: data.
      details = `Disponível em: <${ref.url}>. Acesso em: ${ref.accessDate || 'data atual'}.`;
      break;
  }

  return `${authors} ${title}. ${details}`;
};
