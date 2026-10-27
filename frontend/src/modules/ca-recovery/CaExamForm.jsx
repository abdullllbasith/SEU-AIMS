const PREFIX = 'SEU/IS/';
const YEAR_OPTIONS = [
  ['1', 'First Year'],
  ['2', 'Second Year'],
  ['3', 'Third Year'],
  ['4', 'Fourth Year'],
];

function blankForm() {
  return {
    title: '',
    name: '',
    registrationNumber: '',
    currentYear: '',
    currentSemester: '',
    examinationSemester: '',
    examinationYear: '',
    specialization: '',
    address: '',
    mobile: '',
    subjects: [],
    signedOn: '',
    faculty: 'FT',
  };
}

export function CaExamForm({ form, onChange, readOnly = false, qrDataUrl = '', applicationId = '' }) {
  const value = { ...blankForm(), ...(form || {}) };
  const registration = String(value.registrationNumber || '').toUpperCase();
  const suffix = registration.startsWith(PREFIX) ? registration.slice(PREFIX.length) : registration;
  const rows = Array.from({ length: 8 }, (_, index) => value.subjects[index] || { code: '', credits: '', title: '', locked: true });

  function update(patch) {
    if (readOnly || !onChange) {
      return;
    }
    onChange({ ...value, ...patch });
  }

  function updateSubject(index, key, next) {
    if (index >= value.subjects.length) {
      return;
    }
    const subjects = value.subjects.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [key]: key === 'credits' ? next : next.toUpperCase() } : row,
    );
    update({ subjects });
  }

  return (
    <article className="exam-form">
      {applicationId ? <p className="exam-form__id">{applicationId}</p> : null}
      <p className="exam-form__office">office use only</p>
      {qrDataUrl ? <img className="exam-form__qr" src={qrDataUrl} alt="Verification QR code" /> : null}
      <header className="exam-form__head">
        <img
          className="exam-form__logo"
          src="/South_Eastern_University_of_Sri_Lanka_logo.png"
          alt=""
        />
        <div className="exam-form__identity">
          <h2>South Eastern University of Sri Lanka</h2>
          <p>Examination Division</p>
          <p className="exam-form__doc-title">Application for Examination (Continuous Assessment)</p>
          <p>(Repeat Candidates only)</p>
          <p className="exam-form__instruction">This form should be completed in CAPITAL letters and the appropriate box ticked.</p>
        </div>
      </header>

      <h3>Part - I</h3>

      <div className="exam-form__row">
        <span className="exam-form__label">01. Name with initials:</span>
        <label className="exam-form__tick">
          <input
            type="checkbox"
            checked={value.title === 'Mr.'}
            disabled={readOnly}
            onChange={() => update({ title: value.title === 'Mr.' ? '' : 'Mr.' })}
          />
          Mr.
        </label>
        <label className="exam-form__tick">
          <input
            type="checkbox"
            checked={value.title === 'Ms.'}
            disabled={readOnly}
            onChange={() => update({ title: value.title === 'Ms.' ? '' : 'Ms.' })}
          />
          Ms.
        </label>
        <input
          className="exam-form__line exam-form__line--grow"
          aria-label="Name with initials"
          value={value.name}
          readOnly={readOnly}
          onChange={(event) => update({ name: event.target.value.toUpperCase() })}
        />
      </div>

      <label className="exam-form__row">
        <span className="exam-form__label">02. Registration No.:</span>
        <span className="exam-form__prefix">SEU/IS/</span>
        <input
          className="exam-form__line exam-form__line--grow"
          aria-label="Registration number"
          value={suffix}
          readOnly={readOnly}
          onChange={(event) => update({ registrationNumber: `${PREFIX}${event.target.value.toUpperCase()}` })}
        />
      </label>

      <div className="exam-form__row">
        <span className="exam-form__label">03. Current Academic Year:</span>
        <input
          className="exam-form__line exam-form__line--year"
          aria-label="Current academic year"
          value={value.currentYear}
          readOnly={readOnly}
          onChange={(event) => update({ currentYear: event.target.value.toUpperCase() })}
        />
        <span>/</span>
        <input
          className="exam-form__line exam-form__line--year"
          aria-label="Current semester"
          value={value.currentSemester}
          readOnly={readOnly}
          onChange={(event) => update({ currentSemester: event.target.value.toUpperCase() })}
        />
      </div>

      <div className="exam-form__row exam-form__row--wrap">
        <span className="exam-form__label">04. Faculty:</span>
        <label className="exam-form__tick">
          <input type="checkbox" checked readOnly disabled />
          FT
        </label>
        <span className="exam-form__label">05. Semester:</span>
        {['I', 'II'].map((semester) => (
          <label key={semester} className="exam-form__tick">
            <input
              type="checkbox"
              checked={value.examinationSemester === semester}
              disabled={readOnly}
              onChange={() => update({ examinationSemester: semester })}
            />
            {semester}
          </label>
        ))}
      </div>

      <fieldset className="exam-form__years">
        <legend>06. Year of Examination (use a separate form for each year):</legend>
        {YEAR_OPTIONS.map(([year, label]) => (
          <label key={year} className="exam-form__tick">
            <input
              type="checkbox"
              checked={value.examinationYear === year}
              disabled={readOnly}
              onChange={() => update({ examinationYear: year })}
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label className="exam-form__row">
        <span className="exam-form__label">07. Field of Specialization (if any):</span>
        <input
          className="exam-form__line exam-form__line--grow"
          value={value.specialization}
          readOnly={readOnly}
          onChange={(event) => update({ specialization: event.target.value.toUpperCase() })}
        />
      </label>

      <label className="exam-form__row exam-form__row--top">
        <span className="exam-form__label">08. Present Address:</span>
        <textarea
          className="exam-form__area"
          rows={2}
          value={value.address}
          readOnly={readOnly}
          onChange={(event) => update({ address: event.target.value.toUpperCase() })}
        />
      </label>

      <label className="exam-form__row">
        <span className="exam-form__label">09. Contact Mobile No.:</span>
        <input
          className="exam-form__line exam-form__line--mobile"
          value={value.mobile}
          readOnly={readOnly}
          onChange={(event) => update({ mobile: event.target.value })}
        />
      </label>

      <p className="exam-form__label">10. Applied subjects:</p>
      <div className="table-scroll">
        <table className="exam-form__table">
          <thead>
            <tr>
              <th>SNo.</th>
              <th>Subject Code (Specify Credit)</th>
              <th>Subject Title</th>
              <th>Signature of Head of Department</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const filled = index < value.subjects.length;
              return (
                <tr key={index}>
                  <td>{String(index + 1).padStart(2, '0')}</td>
                  <td>
                    <input
                      aria-label={`Subject code ${index + 1}`}
                      value={filled ? `${row.code}${row.credits ? ` (${row.credits})` : ''}` : ''}
                      readOnly={readOnly || !filled}
                      onChange={(event) => {
                        const text = event.target.value.toUpperCase();
                        const match = text.trim().match(/^([A-Z0-9/]+)(?:\s*\(([^)]*)\))?$/);
                        if (!match) {
                          updateSubject(index, 'code', text);
                          return;
                        }
                        const subjects = value.subjects.map((item, rowIndex) =>
                          rowIndex === index ? { ...item, code: match[1], credits: (match[2] || '').trim() } : item,
                        );
                        update({ subjects });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      aria-label={`Subject title ${index + 1}`}
                      value={row.title || ''}
                      readOnly={readOnly || !filled}
                      onChange={(event) => updateSubject(index, 'title', event.target.value)}
                    />
                  </td>
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="exam-form__sign">
        <div className="exam-form__date">
          <span>Date:</span>
          <input
            className="exam-form__date-box"
            type="date"
            aria-label="Date"
            value={value.signedOn || ''}
            readOnly={readOnly}
            onChange={(event) => update({ signedOn: event.target.value })}
          />
        </div>
        <div className="exam-form__signature">
          <span className="exam-form__signature-line" />
          <span>Signature of Candidate</span>
        </div>
      </div>

      <section className="exam-form__part-two">
        <h3>Part - II</h3>
        <p>Certified that items 01–10 are checked with me and found correct.</p>
        <div className="exam-form__sign">
          <div className="exam-form__signature">
            <span className="exam-form__signature-line" />
            <span>Signature of Subject in charge</span>
          </div>
          <div className="exam-form__signature exam-form__signature--end">
            <span className="exam-form__signature-line" />
            <span>Assistant Registrar</span>
          </div>
        </div>
      </section>
    </article>
  );
}
