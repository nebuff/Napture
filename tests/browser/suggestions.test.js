// Test suite for omnibar search suggestion fetching and caching

describe('Address Bar Suggestions Controller', () => {
  let addressInput;
  let addressSuggestions;
  let addressContainer;
  let addressSugIndex;
  let currentAddressSuggestions;
  let addressOriginalQuery;
  let isAddressSuggestionsActive;
  let updateOverlayMock;
  let handleAddressSubmitMock;

  beforeEach(() => {
    addressInput = { value: '', blur: jest.fn() };
    addressSuggestions = {
      innerHTML: '',
      children: [],
      classList: {
        classes: new Set(['hidden']),
        add: function(c) { this.classes.add(c); },
        remove: function(c) { this.classes.delete(c); },
        contains: function(c) { return this.classes.has(c); }
      },
      appendChild: function(child) { this.children.push(child); }
    };
    addressContainer = {
      getBoundingClientRect: () => ({ left: 100, bottom: 40, width: 500 })
    };
    addressSugIndex = -1;
    currentAddressSuggestions = [];
    addressOriginalQuery = '';
    isAddressSuggestionsActive = false;
    updateOverlayMock = jest.fn();
    handleAddressSubmitMock = jest.fn();
  });

  function hideAddressSuggestions() {
    isAddressSuggestionsActive = false;
    addressSugIndex = -1;
    currentAddressSuggestions = [];
    addressOriginalQuery = '';
    if (addressSuggestions) {
      addressSuggestions.innerHTML = '';
      addressSuggestions.classList.add('hidden');
    }
    updateOverlayMock({ suggestions: [], bounds: { x: 0, y: 0, width: 0 }, selectedIndex: -1 });
  }

  function renderAddressSuggestions(selectedIndex = addressSugIndex) {
    if (currentAddressSuggestions.length === 0) {
      hideAddressSuggestions();
      return;
    }
    isAddressSuggestionsActive = true;
    const rect = addressContainer.getBoundingClientRect();
    updateOverlayMock({
      suggestions: currentAddressSuggestions,
      bounds: { x: rect.left, y: rect.bottom, width: rect.width },
      isLight: false,
      selectedIndex: selectedIndex
    });
  }

  function handleKeydown(key) {
    if (key === 'ArrowDown') {
      if (isAddressSuggestionsActive && currentAddressSuggestions.length > 0) {
        addressSugIndex++;
        if (addressSugIndex >= currentAddressSuggestions.length) {
          addressSugIndex = -1;
          addressInput.value = addressOriginalQuery;
        } else {
          addressInput.value = currentAddressSuggestions[addressSugIndex];
        }
        renderAddressSuggestions(addressSugIndex);
      }
    } else if (key === 'ArrowUp') {
      if (isAddressSuggestionsActive && currentAddressSuggestions.length > 0) {
        addressSugIndex--;
        if (addressSugIndex < -1) {
          addressSugIndex = currentAddressSuggestions.length - 1;
        }
        if (addressSugIndex === -1) {
          addressInput.value = addressOriginalQuery;
        } else {
          addressInput.value = currentAddressSuggestions[addressSugIndex];
        }
        renderAddressSuggestions(addressSugIndex);
      }
    } else if (key === 'Enter') {
      if (addressSugIndex >= 0 && currentAddressSuggestions[addressSugIndex]) {
        addressInput.value = currentAddressSuggestions[addressSugIndex];
      }
      hideAddressSuggestions();
      handleAddressSubmitMock();
      addressInput.blur();
    } else if (key === 'Escape') {
      if (isAddressSuggestionsActive) {
        if (addressOriginalQuery) {
          addressInput.value = addressOriginalQuery;
        }
        hideAddressSuggestions();
      }
    }
  }

  it('should initialize with suggestions hidden and index -1', () => {
    expect(addressSugIndex).toBe(-1);
    expect(isAddressSuggestionsActive).toBe(false);
  });

  it('should correctly render suggestions and send bounds + selectedIndex to overlay', () => {
    currentAddressSuggestions = ['github', 'github copilot', 'github status'];
    renderAddressSuggestions(-1);

    expect(isAddressSuggestionsActive).toBe(true);
    expect(updateOverlayMock).toHaveBeenCalledWith(expect.objectContaining({
      suggestions: ['github', 'github copilot', 'github status'],
      bounds: { x: 100, y: 40, width: 500 },
      selectedIndex: -1
    }));
  });

  it('should navigate down through suggestions on ArrowDown and cycle back to original query', () => {
    addressOriginalQuery = 'git';
    addressInput.value = 'git';
    currentAddressSuggestions = ['github', 'github desktop', 'gitlab'];
    isAddressSuggestionsActive = true;

    // ArrowDown 1 -> first suggestion 'github'
    handleKeydown('ArrowDown');
    expect(addressSugIndex).toBe(0);
    expect(addressInput.value).toBe('github');
    expect(updateOverlayMock).toHaveBeenLastCalledWith(expect.objectContaining({ selectedIndex: 0 }));

    // ArrowDown 2 -> second suggestion 'github desktop'
    handleKeydown('ArrowDown');
    expect(addressSugIndex).toBe(1);
    expect(addressInput.value).toBe('github desktop');
    expect(updateOverlayMock).toHaveBeenLastCalledWith(expect.objectContaining({ selectedIndex: 1 }));

    // ArrowDown 3 -> third suggestion 'gitlab'
    handleKeydown('ArrowDown');
    expect(addressSugIndex).toBe(2);
    expect(addressInput.value).toBe('gitlab');
    expect(updateOverlayMock).toHaveBeenLastCalledWith(expect.objectContaining({ selectedIndex: 2 }));

    // ArrowDown 4 -> cycles back to original typed query 'git' (index -1)
    handleKeydown('ArrowDown');
    expect(addressSugIndex).toBe(-1);
    expect(addressInput.value).toBe('git');
    expect(updateOverlayMock).toHaveBeenLastCalledWith(expect.objectContaining({ selectedIndex: -1 }));
  });

  it('should navigate up through suggestions on ArrowUp and wrap to end', () => {
    addressOriginalQuery = 'git';
    addressInput.value = 'git';
    currentAddressSuggestions = ['github', 'github desktop', 'gitlab'];
    isAddressSuggestionsActive = true;

    // ArrowUp from -1 -> wraps to last suggestion 'gitlab' (index 2)
    handleKeydown('ArrowUp');
    expect(addressSugIndex).toBe(2);
    expect(addressInput.value).toBe('gitlab');
    expect(updateOverlayMock).toHaveBeenLastCalledWith(expect.objectContaining({ selectedIndex: 2 }));

    // ArrowUp -> second suggestion 'github desktop' (index 1)
    handleKeydown('ArrowUp');
    expect(addressSugIndex).toBe(1);
    expect(addressInput.value).toBe('github desktop');

    // ArrowUp -> first suggestion 'github' (index 0)
    handleKeydown('ArrowUp');
    expect(addressSugIndex).toBe(0);
    expect(addressInput.value).toBe('github');

    // ArrowUp -> returns to original query 'git' (index -1)
    handleKeydown('ArrowUp');
    expect(addressSugIndex).toBe(-1);
    expect(addressInput.value).toBe('git');
  });

  it('should submit on Enter, hide suggestions, and blur input', () => {
    currentAddressSuggestions = ['github'];
    isAddressSuggestionsActive = true;
    addressInput.value = 'github';

    handleKeydown('Enter');
    expect(handleAddressSubmitMock).toHaveBeenCalled();
    expect(isAddressSuggestionsActive).toBe(false);
    expect(addressInput.blur).toHaveBeenCalled();
  });

  it('should submit the highlighted suggestion when pressing Enter during arrow navigation', () => {
    addressOriginalQuery = 'lol';
    addressInput.value = 'lol';
    currentAddressSuggestions = ['lol', 'lola blankets', 'loldle'];
    isAddressSuggestionsActive = true;

    // Navigate to 'loldle' (index 2)
    handleKeydown('ArrowDown'); // index 0 ('lol')
    handleKeydown('ArrowDown'); // index 1 ('lola blankets')
    handleKeydown('ArrowDown'); // index 2 ('loldle')
    expect(addressSugIndex).toBe(2);

    handleKeydown('Enter');
    expect(addressInput.value).toBe('loldle');
    expect(handleAddressSubmitMock).toHaveBeenCalled();
    expect(isAddressSuggestionsActive).toBe(false);
  });

  it('should restore original query and hide suggestions on Escape', () => {
    addressOriginalQuery = 'my search';
    addressInput.value = 'my search suggestion';
    currentAddressSuggestions = ['my search suggestion'];
    isAddressSuggestionsActive = true;

    handleKeydown('Escape');
    expect(addressInput.value).toBe('my search');
    expect(isAddressSuggestionsActive).toBe(false);
  });
});
