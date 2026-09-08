import {
  MAX_NUMBERED_ITEMS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  MIN_NUMBERED_ITEMS,
  MIN_TABLE_COLUMNS,
  MIN_TABLE_ROWS,
  PRESENTATION_KINDS,
  addNumberedItem,
  addTableColumn,
  addTableRow,
  removeNumberedItem,
  removeTableColumn,
  removeTableRow,
  syncTableShape,
} from '../utils/questionPresentationForm';

function Field({ id, label, children }) {
  return (
    <div className="form-row">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function IntroField({ content, disabled, onChange }) {
  return (
    <Field id="presentationIntro" label="Intro">
      <textarea
        id="presentationIntro"
        className="input"
        rows={2}
        value={content.intro}
        onChange={(e) => onChange({ ...content, intro: e.target.value })}
        placeholder="Optional lead-in"
        disabled={disabled}
      />
    </Field>
  );
}

function PromptField({ content, disabled, onChange, placeholder }) {
  return (
    <Field id="presentationPrompt" label="Prompt">
      <textarea
        id="presentationPrompt"
        className="input"
        rows={2}
        value={content.prompt}
        onChange={(e) => onChange({ ...content, prompt: e.target.value })}
        placeholder={placeholder || 'Optional closing prompt'}
        disabled={disabled}
      />
    </Field>
  );
}

function TwoStatementsEditor({ content, disabled, onChange }) {
  const statements = Array.isArray(content.statements) ? content.statements : [];

  function updateStatement(index, patch) {
    const next = statements.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange({ ...content, statements: next });
  }

  return (
    <div className="presentation-editor">
      <div className="form-row">
        <label className="label" htmlFor="presentationIntro">
          Intro
        </label>
        <textarea
          id="presentationIntro"
          className="input"
          rows={2}
          value={content.intro}
          onChange={(e) => onChange({ ...content, intro: e.target.value })}
          placeholder="Optional. Example: Consider the following statements:"
          disabled={disabled}
        />
      </div>

      {statements.slice(0, 2).map((row, i) => (
        <div key={i} className="presentation-block">
          <p className="presentation-block-title">Statement {i + 1}</p>
          <div className="form-row">
            <label className="label" htmlFor={`statementLabel${i}`}>
              Label *
            </label>
            <input
              id={`statementLabel${i}`}
              type="text"
              className="input"
              value={row.label}
              onChange={(e) => updateStatement(i, { label: e.target.value })}
              placeholder={i === 0 ? 'Statement – I' : 'Statement – II'}
              disabled={disabled}
            />
          </div>
          <div className="form-row">
            <label className="label" htmlFor={`statementText${i}`}>
              Text *
            </label>
            <textarea
              id={`statementText${i}`}
              className="input"
              rows={3}
              value={row.text}
              onChange={(e) => updateStatement(i, { text: e.target.value })}
              placeholder="Statement text"
              disabled={disabled}
            />
          </div>
        </div>
      ))}

      <div className="form-row">
        <label className="label" htmlFor="presentationPrompt">
          Prompt
        </label>
        <textarea
          id="presentationPrompt"
          className="input"
          rows={2}
          value={content.prompt}
          onChange={(e) => onChange({ ...content, prompt: e.target.value })}
          placeholder="Optional. Example: Which one of the following is correct in respect of the above statements?"
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function NumberedListEditor({ content, disabled, onChange }) {
  const items = Array.isArray(content.items) ? content.items : [];

  function updateItem(index, patch) {
    const next = items.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange({ ...content, items: next });
  }

  return (
    <div className="presentation-editor">
      <IntroField content={content} disabled={disabled} onChange={onChange} />
      <div className="form-row">
        <span className="label">Items * ({MIN_NUMBERED_ITEMS}–{MAX_NUMBERED_ITEMS})</span>
        <p className="helper">
          Numbers are saved as entered. They are not auto-renumbered on save.
        </p>
        <div className="presentation-item-list">
          {items.map((item, i) => (
            <div key={i} className="presentation-item-row">
              <input
                type="number"
                className="input presentation-n-input"
                min={1}
                step={1}
                value={item.n}
                onChange={(e) => updateItem(i, { n: e.target.value })}
                disabled={disabled}
                aria-label={`Item ${i + 1} number`}
              />
              <textarea
                className="input"
                rows={2}
                value={item.text}
                onChange={(e) => updateItem(i, { text: e.target.value })}
                placeholder="Item text"
                disabled={disabled}
                aria-label={`Item ${i + 1} text`}
              />
              <button
                type="button"
                className="btn btn-secondary presentation-icon-btn"
                onClick={() => onChange(removeNumberedItem(content, i))}
                disabled={disabled || items.length <= MIN_NUMBERED_ITEMS}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onChange(addNumberedItem(content))}
          disabled={disabled || items.length >= MAX_NUMBERED_ITEMS}
        >
          Add item
        </button>
      </div>
      <PromptField
        content={content}
        disabled={disabled}
        onChange={onChange}
        placeholder="Optional. Example: How many of the above are correct?"
      />
    </div>
  );
}

function TableEditor({ content, disabled, onChange }) {
  const synced = syncTableShape(content);

  function updateColumn(index, value) {
    const columns = synced.columns.map((c, i) => (i === index ? value : c));
    onChange({ ...synced, columns });
  }

  function updateCell(rowIndex, colIndex, value) {
    const rows = synced.rows.map((row, r) =>
      r === rowIndex ? row.map((cell, c) => (c === colIndex ? value : cell)) : row
    );
    onChange({ ...synced, rows });
  }

  return (
    <div className="presentation-editor">
      <IntroField content={content} disabled={disabled} onChange={onChange} />
      <div className="form-row">
        <span className="label">
          Table * ({MIN_TABLE_COLUMNS}–{MAX_TABLE_COLUMNS} columns, {MIN_TABLE_ROWS}–
          {MAX_TABLE_ROWS} rows)
        </span>
        <p className="helper">Empty cells are allowed. Column names are required.</p>
        <div className="presentation-table-wrap">
          <table className="presentation-table">
            <thead>
              <tr>
                {synced.columns.map((col, i) => (
                  <th key={i}>
                    <input
                      type="text"
                      className="input"
                      value={col}
                      onChange={(e) => updateColumn(i, e.target.value)}
                      disabled={disabled}
                      aria-label={`Column ${i + 1} name`}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary presentation-icon-btn"
                      onClick={() => onChange(removeTableColumn(synced, i))}
                      disabled={disabled || synced.columns.length <= MIN_TABLE_COLUMNS}
                    >
                      Remove column
                    </button>
                  </th>
                ))}
                <th className="presentation-table-actions" />
              </tr>
            </thead>
            <tbody>
              {synced.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <input
                        type="text"
                        className="input"
                        value={cell}
                        onChange={(e) => updateCell(r, c, e.target.value)}
                        disabled={disabled}
                        aria-label={`Row ${r + 1} column ${c + 1}`}
                      />
                    </td>
                  ))}
                  <td className="presentation-table-actions">
                    <button
                      type="button"
                      className="btn btn-secondary presentation-icon-btn"
                      onClick={() => onChange(removeTableRow(synced, r))}
                      disabled={disabled || synced.rows.length <= MIN_TABLE_ROWS}
                    >
                      Remove row
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="presentation-table-toolbar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onChange(addTableColumn(synced))}
            disabled={disabled || synced.columns.length >= MAX_TABLE_COLUMNS}
          >
            Add column
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onChange(addTableRow(synced))}
            disabled={disabled || synced.rows.length >= MAX_TABLE_ROWS}
          >
            Add row
          </button>
        </div>
      </div>
      <PromptField
        content={synced}
        disabled={disabled}
        onChange={onChange}
        placeholder="Optional. Example: Select the correct pair."
      />
    </div>
  );
}

export default function QuestionPresentationFields({
  presentationKind,
  content,
  questionText,
  disabled,
  onContentChange,
  onQuestionTextChange,
}) {
  const kind = presentationKind || PRESENTATION_KINDS.PLAIN;

  if (kind === PRESENTATION_KINDS.PLAIN) {
    return (
      <div className="form-row">
        <label className="label" htmlFor="questionText">
          Question text *
        </label>
        <textarea
          id="questionText"
          className="input"
          rows={3}
          value={questionText}
          onChange={(e) => onQuestionTextChange(e.target.value)}
          placeholder="Enter the question…"
          disabled={disabled}
        />
      </div>
    );
  }

  if (kind === PRESENTATION_KINDS.TWO_STATEMENTS) {
    return (
      <TwoStatementsEditor content={content} disabled={disabled} onChange={onContentChange} />
    );
  }
  if (kind === PRESENTATION_KINDS.NUMBERED_LIST) {
    return (
      <NumberedListEditor content={content} disabled={disabled} onChange={onContentChange} />
    );
  }
  return <TableEditor content={content} disabled={disabled} onChange={onContentChange} />;
}
