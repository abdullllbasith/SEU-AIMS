import { parseBlocks, parseInline } from './message-format.js';
import { isImageType } from './attachment-rules.js';
import { studyAgentApi } from './study-agent-api.js';

function Inline({ text, sourceCount }) {
  return parseInline(text).map((token, index) => {
    if (token.type === 'bold') {
      return <strong key={index}>{token.value}</strong>;
    }
    if (token.type === 'code') {
      return <code key={index}>{token.value}</code>;
    }
    if (token.type === 'cite') {
      // Only markers that point at a listed source render as citations.
      return token.value >= 1 && token.value <= sourceCount ? (
        <sup key={index} className="study-agent__cite" title={`Source ${token.value}`}>
          {token.value}
        </sup>
      ) : (
        `[${token.value}]`
      );
    }
    return token.value;
  });
}

/** `images` are the message's attachments; an [image:N] line in the text shows the Nth image. */
export function MessageContent({ text, sourceCount = 0, images = [] }) {
  const pictures = images.filter((item) => isImageType(item.mimeType) && item.id);
  return (
    <div className="study-agent__prose">
      {parseBlocks(text).map((block, index) => {
        if (block.type === 'image') {
          const picture = pictures[block.index - 1];
          if (!picture) {
            return null;
          }
          const src = studyAgentApi.attachmentContentUrl(picture.id);
          const caption = picture.name || `Image ${block.index}`;
          return (
            <figure key={index} className="study-agent__figure">
              <a href={src} target="_blank" rel="noopener noreferrer">
                <img src={src} alt={caption} loading="lazy" />
              </a>
              <figcaption>{caption}</figcaption>
            </figure>
          );
        }
        if (block.type === 'code') {
          return (
            <pre key={index}>
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === 'h') {
          return (
            <p key={index} className="study-agent__prose-heading">
              <Inline text={block.text} sourceCount={sourceCount} />
            </p>
          );
        }
        if (block.type === 'table') {
          return (
            <div key={index} className="study-agent__table-wrap">
              <table className="study-agent__table">
                <thead>
                  <tr>
                    {block.head.map((cell, cellIndex) => (
                      <th key={cellIndex} scope="col">
                        <Inline text={cell} sourceCount={sourceCount} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>
                          <Inline text={cell} sourceCount={sourceCount} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'ul' || block.type === 'ol') {
          const List = block.type;
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline text={item} sourceCount={sourceCount} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index}>
            <Inline text={block.text} sourceCount={sourceCount} />
          </p>
        );
      })}
    </div>
  );
}
