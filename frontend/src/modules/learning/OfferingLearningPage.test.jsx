import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { OfferingLearningPage } from './OfferingLearningPage.jsx';
import { AuthContext } from '../../state/AuthProvider.jsx';

vi.mock('./learning-api.js', () => ({
  learningApi: {
    offering: vi.fn(),
    resources: vi.fn(),
    downloadUrl: (id) => `/api/learning/resources/${id}/download`,
    createSection: vi.fn(),
    updateSection: vi.fn(),
    deleteSection: vi.fn(),
    updateResource: vi.fn(),
    archive: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    createResource: vi.fn(),
  },
}));

import { learningApi } from './learning-api.js';

const offering = {
  data: {
    offering: { subjectCode: 'CIS22012', subjectName: 'Distributed and Cloud computing' },
    lecturers: [{ displayName: 'LECTURER_A' }],
    sections: [{ id: 'sec-1', name: 'Notes' }],
  },
};

const resources = {
  data: {
    items: [
      {
        id: 'res-1',
        sectionId: 'sec-1',
        title: 'Slide1',
        displayFilename: 'Slide1.pdf',
        mimeType: 'application/pdf',
        category: 'LECTURE',
        publicationState: 'PUBLISHED',
        scanStatus: 'SAFE',
      },
    ],
  },
};

describe('OfferingLearningPage', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    learningApi.offering.mockResolvedValue(offering);
    learningApi.resources.mockResolvedValue(resources);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  async function renderPage(role) {
    await act(async () => {
      root.render(
        createElement(
          AuthContext.Provider,
          { value: { status: 'authenticated', user: { id: 'u1', role } } },
          createElement(
            MemoryRouter,
            { initialEntries: ['/learning/offerings/off-1'] },
            createElement(
              Routes,
              null,
              createElement(Route, { path: '/learning/offerings/:offeringId', element: createElement(OfferingLearningPage) }),
            ),
          ),
        ),
      );
    });
    await act(async () => {});
  }

  it('shows official folders to students and the files inside', async () => {
    await renderPage('STUDENT');
    expect(container.textContent).toContain('Notes');
    expect(container.textContent).not.toContain('Create folder');
    const folder = container.querySelector('.folder-tile');
    await act(async () => {
      folder.click();
    });
    expect(container.textContent).toContain('Slide1');
    expect(container.querySelector('.file-tile__mark')?.textContent).toBe('PDF');
    expect(container.querySelector('[aria-label="Actions for Notes"]')).toBeFalsy();
  });

  it('lets a lecturer rename a folder from the folder menu', async () => {
    learningApi.updateSection.mockResolvedValue({ data: { id: 'sec-1', name: 'Week 1' } });
    await renderPage('LECTURER');
    expect(container.textContent).toContain('Create folder');
    const menu = container.querySelector('[aria-label="Actions for Notes"]');
    await act(async () => {
      menu.click();
    });
    const rename = [...container.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === 'Rename');
    await act(async () => {
      rename.click();
    });
    expect(container.querySelector('#offering-folder-title')?.textContent).toBe('Rename folder');
    const input = container.querySelector('input');
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setValue.call(input, 'Week 1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...container.querySelectorAll('button')].find((node) => node.textContent === 'Save');
    await act(async () => {
      save.click();
    });
    expect(learningApi.updateSection).toHaveBeenCalledWith('sec-1', { name: 'Week 1' });
  });
});
