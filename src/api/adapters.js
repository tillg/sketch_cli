// SUCypress adapter scripts

export function getStats() {
  return `(() => {
    return Module.getModelInfo().stats;
  })()`;
}

export function getModelInfo() {
  return `(() => {
    return {
      filePath: Module.GetModelFilePath ? Module.GetModelFilePath() : Module.getModelFilePath(),
      version: Module.GetModelVersion ? Module.GetModelVersion() : null,
      info: Module.getModelInfo()
    };
  })()`;
}

export function getMaterials() {
  return `(() => {
    const mb = new Module.WebMaterialBrowser();
    const mats = mb.getInModelMaterials();
    const result = [];
    for (let i = 0; i < mats.size(); i++) {
      result.push(mats.get(i).getName());
    }
    return result;
  })()`;
}

export function getComponents() {
  return `(() => {
    const cb = new Module.WebComponentBrowser();
    const comps = cb.getInModelComponents();
    const result = [];
    for (let i = 0; i < comps.size(); i++) {
      result.push(comps.get(i).getDefinitionName());
    }
    return result;
  })()`;
}

export function getScenes() {
  return `(() => {
    const chunk = window.webpackChunksketchup_web_frontend;
    let wpRequire;
    chunk.push([['__cli_scenes'], {}, (r) => { wpRequire = r; }]);
    const store = wpRequire(96459).store;
    const scenes = store.state.scenes.scenes;
    return scenes.map((s, i) => ({ index: i, name: s.getName() }));
  })()`;
}

export function activateScene(index) {
  return `(() => {
    const chunk = window.webpackChunksketchup_web_frontend;
    let wpRequire;
    chunk.push([['__cli_scenes2'], {}, (r) => { wpRequire = r; }]);
    const store = wpRequire(96459).store;
    store.dispatch('activateScene', ${index});
  })()`;
}

export function getTags() {
  return `(() => {
    const browser = window.SUCypress.getAdapter('tags').browser;
    const allTags = browser.getAllTags();
    const result = [];
    for (let i = 0; i < allTags.size(); i++) {
      const tag = allTags.get(i);
      result.push({ name: tag.name, visible: tag.isVisible, color: tag.color || null });
    }
    return result;
  })()`;
}

export function createTag(name) {
  const escapedName = JSON.stringify(name);
  return `(() => {
    const browser = window.SUCypress.getAdapter('tags').browser;
    browser.addTag();
    const allTags = browser.getAllTags();
    const newTag = allTags.get(allTags.size() - 1);
    browser.setName(newTag, ${escapedName});
  })()`;
}

export function setTagVisibility(name, visible) {
  const escapedName = JSON.stringify(name);
  return `(() => {
    const browser = window.SUCypress.getAdapter('tags').browser;
    const allTags = browser.getAllTags();
    for (let i = 0; i < allTags.size(); i++) {
      const tag = allTags.get(i);
      if (tag.name === ${escapedName}) {
        browser.setVisibilityForTag(tag, ${visible});
        return true;
      }
    }
    return false;
  })()`;
}

export function selectByTag(name) {
  const escapedName = JSON.stringify(name);
  return `(() => {
    Module.SelectEntitiesByTagName(${escapedName});
  })()`;
}

export function getSelection() {
  return `(() => {
    const adapter = window.SUCypress.getAdapter('selection');
    const ei = Module.WebEntityInfo.getInstance();
    return {
      count: ei.getSelectionCount(),
      edgeCount: ei.getSelectedEdgeCount(),
      title: ei.getTitle(),
      infoType: ei.getInfoType(),
      instanceName: ei.getInstanceName(),
      definitionName: ei.getDefinitionName(),
      area: ei.getAreaAsString(),
      volume: ei.getVolumeAsString(),
      visible: ei.isVisible(),
      locked: ei.isLocked()
    };
  })()`;
}

export function getPlans() {
  return `(async () => {
    const adapter = window.SUCypress.getAdapter('tcFileOperations');
    const projects = await adapter.getProjects();
    return JSON.parse(JSON.stringify(projects));
  })()`;
}

export function checkDialog() {
  return `(() => {
    const buttons = [...document.querySelectorAll('button')];
    if (buttons.some(b => (b.innerText || '').trim() === "Don't Save")) return 'Save Changes';
    if (buttons.some(b => (b.innerText || '').trim() === 'No') && (document.body?.innerText || '').includes('Purge unused items')) {
      return 'Purge unused items';
    }
    if ((document.body?.innerText || '').includes('SAVE TO') && buttons.some(b => String(b.className || '').includes('close-button'))) {
      return 'SAVE TO';
    }
    const active = [...document.querySelectorAll('div[aria-modal="true"], div[role="dialog"]')];
    if (active.length) return active[0].textContent.trim().substring(0, 120);
    const okBtn = buttons.find(b => b.textContent.trim() === 'Okay');
    if (okBtn) return okBtn.closest('div')?.textContent.trim().substring(0, 120) ?? 'unknown dialog';
    return null;
  })()`;
}

export function dismissBlockingDialogs() {
  return `(() => {
    const buttons = [...document.querySelectorAll('button')];

    const dontSave = buttons.find(b => (b.innerText || '').trim() === "Don't Save");
    if (dontSave) {
      dontSave.click();
      return { dismissed: ['Save Changes'] };
    }

    const noBtn = buttons.find(b => (b.innerText || '').trim() === 'No');
    if (noBtn && (document.body?.innerText || '').includes('Purge unused items')) {
      noBtn.click();
      return { dismissed: ['Purge unused items'] };
    }

    const saveToClose = buttons.find(b =>
      String(b.className || '').includes('close-button') && (document.body?.innerText || '').includes('SAVE TO')
    );
    if (saveToClose) {
      saveToClose.click();
      return { dismissed: ['SAVE TO'] };
    }

    return { dismissed: [] };
  })()`;
}

export function isSaveNeeded() {
  return `(() => { return Module.IsSaveNeeded ? Module.IsSaveNeeded() : false; })()`;
}
