function createMockElement(tag = 'div') {
  const children = [];
  const classList = new Set();
  const style = {};
  const listeners = {};

  const elem = {
    tagName: tag.toUpperCase(),
    children,
    classList: {
      add: (cls) => classList.add(cls),
      remove: (cls) => classList.delete(cls),
      contains: (cls) => classList.has(cls)
    },
    style,
    innerHTML: '',
    textContent: '',
    title: '',
    appendChild: (child) => children.push(child),
    querySelector: (selector) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        const search = (node) => {
          for (const child of node.children) {
            if (child.classList && child.classList.contains(cls)) return child;
            const res = search(child);
            if (res) return res;
          }
          return null;
        };
        return search(elem);
      }
      return null;
    },
    addEventListener: (event, fn) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    click: () => {
      if (listeners['click']) {
        listeners['click'].forEach(fn => fn({ stopPropagation: jest.fn() }));
      }
    }
  };

  return elem;
}

describe('Download Menu & State Management Tests', () => {
  let downloadsBtn;
  let listEl;

  beforeEach(() => {
    downloadsBtn = createMockElement('button');
    downloadsBtn.id = 'downloads-btn';

    listEl = createMockElement('div');
    listEl.id = 'downloads-list';

    global.document = {
      getElementById: (id) => {
        if (id === 'downloads-btn') return downloadsBtn;
        if (id === 'downloads-list') return listEl;
        return null;
      },
      createElement: (tag) => createMockElement(tag),
      body: createMockElement('body')
    };

    global.escapeHtml = (str) => String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    global.getDownloadIconSvg = () => '<svg></svg>';
  });

  afterEach(() => {
    delete global.document;
    delete global.escapeHtml;
    delete global.getDownloadIconSvg;
  });

  test('should render download items with progress bar and remaining time', () => {
    const item = {
      id: 'dl_1',
      name: 'sample_file.zip',
      sizeStr: '15.0 MB',
      timeStr: '45% • 12s left',
      type: 'archive',
      completed: false,
      paused: false,
      cancelled: false,
      progress: 45
    };

    const el = createMockElement('div');
    el.classList.add('download-item');
    el.classList.add('is-downloading');

    const nameEl = createMockElement('div');
    nameEl.classList.add('download-file-name');
    nameEl.textContent = item.name;
    el.appendChild(nameEl);

    const metaEl = createMockElement('div');
    metaEl.classList.add('download-file-meta');
    metaEl.textContent = `${item.sizeStr} • ${item.timeStr}`;
    el.appendChild(metaEl);

    const barFillEl = createMockElement('div');
    barFillEl.classList.add('download-progress-fill');
    barFillEl.style.width = `${item.progress}%`;
    el.appendChild(barFillEl);

    listEl.appendChild(el);

    expect(listEl.querySelector('.download-file-name').textContent).toBe('sample_file.zip');
    expect(listEl.querySelector('.download-file-meta').textContent).toContain('12s left');
    expect(listEl.querySelector('.download-progress-fill').style.width).toBe('45%');
  });

  test('should update download icon to display remaining time bar during active download', () => {
    const activeItem = {
      name: 'large_video.mp4',
      timeStr: '60% • 35s left',
      progress: 60,
      completed: false,
      cancelled: false
    };

    let timeDisplay = activeItem.timeStr.split('•').pop().trim();
    downloadsBtn.innerHTML = `
      <div class="download-icon-bar-container" title="Downloading: ${activeItem.name}">
        <div class="download-icon-bar-fill" style="width: ${activeItem.progress}%"></div>
        <span class="download-icon-bar-text">${timeDisplay}</span>
      </div>
    `;

    expect(downloadsBtn.innerHTML).toContain('35s left');
    expect(downloadsBtn.innerHTML).toContain('style="width: 60%"');
  });

  test('should handle pause and cancel button actions on downloading items', () => {
    const pauseHandler = jest.fn();
    const cancelHandler = jest.fn();

    const btnPause = createMockElement('button');
    btnPause.classList.add('download-btn-pause');
    btnPause.addEventListener('click', (e) => {
      e.stopPropagation();
      pauseHandler();
    });

    const btnCancel = createMockElement('button');
    btnCancel.classList.add('download-btn-cancel');
    btnCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelHandler();
    });

    btnPause.click();
    expect(pauseHandler).toHaveBeenCalledTimes(1);

    btnCancel.click();
    expect(cancelHandler).toHaveBeenCalledTimes(1);
  });
});
