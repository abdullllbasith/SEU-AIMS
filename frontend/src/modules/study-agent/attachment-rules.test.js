import { describe, expect, it } from 'vitest';
import { checkFiles, MAX_FILES, MAX_IMAGE_BYTES, MAX_PDF_BYTES } from './attachment-rules.js';

const file = (name, type, size = 100) => ({ name, type, size });

describe('checkFiles', () => {
  it('accepts jpeg, png, webp, pdf and text files ', () => {
    const { accepted, problems } = checkFiles(0, [
      file('a.jpg', 'image/jpeg'),
      file('b.png', 'image/png'),
      file('c.webp', 'image/webp'),
      file('d.pdf', 'application/pdf'),
      file('e.txt', 'text/plain'),
    ]);
    expect(accepted).toHaveLength(5);
    expect(problems).toEqual([]);
  });

  it('treats .md files with no reported type as plain text', () => {
    const { accepted, problems } = checkFiles(0, [file('f.md', '')]);
    expect(accepted).toHaveLength(1);
    expect(problems).toEqual([]);
  });

  it('rejects other types, empty files and oversized files with a reason each', () => {
    const { accepted, problems } = checkFiles(0, [
      file('slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      file('empty.png', 'image/png', 0),
      file('huge.png', 'image/png', MAX_IMAGE_BYTES + 1),
      file('huge.pdf', 'application/pdf', MAX_PDF_BYTES + 1),
      file('fine.png', 'image/png'),
    ]);
    expect(accepted.map((item) => item.name)).toEqual(['fine.png']);
    expect(problems).toEqual([
      'slides.pptx is not an image, PDF or text file.',
      'empty.png is empty.',
      'huge.png is larger than 5 MB.',
      'huge.pdf is larger than 20 MB.',
    ]);
  });

  it('caps the total number of attachments including those already in the tray', () => {
    const files = Array.from({ length: 4 }, (_, i) => file(`${i}.png`, 'image/png'));
    const { accepted, problems } = checkFiles(MAX_FILES - 2, files);
    expect(accepted).toHaveLength(2);
    expect(problems).toEqual([`You can attach at most ${MAX_FILES} files to one message.`]);
  });
});
