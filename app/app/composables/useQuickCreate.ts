// Shared open-state for the modal-based quick-creates (project/ticket/invoice/
// expense). The forms are mounted once in AppTopBar; both the top-bar/dashboard
// Create menu and the ⌘K command palette flip these flags via `open(kind)`.
export type QuickCreateKind = 'project' | 'ticket' | 'invoice' | 'expense'

export function useQuickCreate() {
  const project = useState('qc:project', () => false)
  const ticket = useState('qc:ticket', () => false)
  const invoice = useState('qc:invoice', () => false)
  const expense = useState('qc:expense', () => false)
  const flags = { project, ticket, invoice, expense }
  function open(k: QuickCreateKind) {
    flags[k].value = true
  }
  return { project, ticket, invoice, expense, open }
}
