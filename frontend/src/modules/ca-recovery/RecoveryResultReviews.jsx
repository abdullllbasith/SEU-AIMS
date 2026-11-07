import { ActionButton } from '../../ui/ActionButton.jsx';
import { Panel } from '../../ui/Panel.jsx';
import { EmptyState } from '../../ui/EmptyState.jsx';

export function RecoveryResultReviews({ items = [], pending = '', onDecide }) {
  return (
    <Panel title="CA recovery results" kicker={`${items.length} pending`}>
      <p>
        These grades were imported for an official E(CA) result. Approving records the imported grade without a C Pass
        cap. Rejecting leaves the official result as E(CA).
      </p>
      {items.length === 0 ? (
        <EmptyState>No CA recovery grades are waiting for review.</EmptyState>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Subject</th>
                <th>Imported grade</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.registrationNumber}</td>
                  <td>{item.subjectCode}</td>
                  <td>{item.rawResultCode}</td>
                  <td>
                    {item.canDecide === false ? <span>Administrator decides</span> : null}
                    {item.canDecide === false ? null : (
                    <>
                    <ActionButton
                      busy={pending === `APPROVE:${item.id}`}
                      busyLabel="Approving…"
                      disabled={Boolean(pending)}
                      onClick={() => onDecide(item.id, 'APPROVE')}
                    >
                      Approve
                    </ActionButton>
                    <ActionButton
                      busy={pending === `REJECT:${item.id}`}
                      busyLabel="Rejecting…"
                      disabled={Boolean(pending)}
                      onClick={() => onDecide(item.id, 'REJECT')}
                    >
                      Reject
                    </ActionButton>
                    </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
