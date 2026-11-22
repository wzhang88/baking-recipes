const search = document.querySelector('#search');
const filters = [...document.querySelectorAll('[data-filter]')];
const count = document.querySelector('.count');
const empty = document.querySelector('.empty');
const languageSwitch = document.querySelector('#language-switch');
const languageMessage = document.querySelector('#language-message');
const heroDescription = document.querySelector('#hero-description');
const recipeContainer = document.querySelector('#recipes');
const loadMessage = document.querySelector('#load-message');

const categoryNamesZh = { bread: '面包', cake: '蛋糕', snack: '点心' };
const categoryNames = { bread: 'Bread', cake: 'Cakes', snack: 'Treats' };
const filterNames = {
  zh: { all: '全部', bread: '面包', cake: '蛋糕', snack: '点心', planned: '待试做' },
  en: { all: 'All', bread: 'Bread', cake: 'Cakes', snack: 'Treats', planned: 'To try' }
};

const recipes = [];
let active = 'all';
let language = 'zh';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = text;
  return element;
}

function localized(value, lang = language) {
  return typeof value === 'string' ? value : value?.[lang] ?? value?.zh ?? '';
}

function scaleFactor(recipe) {
  const scale = recipe.data?.scale;
  if (!scale) return 1;
  if (scale.type === 'flour') return (recipe.scaleChoice ?? scale.baseFlourGrams) / scale.baseFlourGrams;
  if (scale.type === 'round_pan') {
    const diameter = recipe.scaleChoice ?? scale.baseDiameterIn;
    return (diameter / scale.baseDiameterIn) ** 2 / scale.basePanCount;
  }
  return recipe.scaleChoice ?? 1;
}

function formatQuantity(ingredient, factor, lang) {
  const original = localized(ingredient.amount, lang);
  if (ingredient.quantity?.percentOfFlour != null) {
    const grams = Math.round(ingredient.quantity.percentOfFlour * factor * 10) / 10;
    return `${grams} g (${ingredient.quantity.percentOfFlour}% ${lang === 'en' ? 'of flour' : '面粉比'})`;
  }
  if (factor === 1) return original;
  if (!ingredient.quantity) return original + (lang === 'en' ? ' · original note, not scaled' : ' · 原记录，未换算');
  const { value, unit, approxGramPerEgg, kind, min, max, parts, partLabels, alternatives } = ingredient.quantity;
  const display = number => String(Math.round(number * 10) / 10);
  if (min != null && max != null) return `${display(min * factor)}–${display(max * factor)} ${unit}`;
  if (parts) return parts.map((part, i) => `${localized(partLabels, lang)?.[i] || ''} ${display(part * factor)} ${unit}`.trim()).join(' + ');
  if (alternatives) return alternatives.map(option => option.map(part => `${display(part * factor)} ${unit}`).join(' + ')).join(lang === 'en' ? ' or ' : ' 或 ');
  const scaled = value * factor;
  const rounded = display(scaled);
  if (unit === 'can') return lang === 'en' ? `${rounded} can${scaled === 1 ? '' : 's'} (same can size)` : `${rounded} 罐（同规格）`;
  if (unit === 'egg') {
    const eggName = lang === 'en' ? ({ whole: 'eggs', white: 'egg whites', yolk: 'egg yolks' }[kind] || 'eggs') : '个';
    const eggs = `${rounded} ${eggName}`;
    const grams = Math.round(scaled * approxGramPerEgg);
    return lang === 'en' ? `about ${eggs} (about ${grams} g ${kind === 'white' ? 'whites' : kind === 'yolk' ? 'yolks' : 'beaten egg'})` : `约 ${eggs}（约 ${grams} g，打散称重）`;
  }
  return `${rounded} ${unit}`;
}

function scaleControl(recipe, lang) {
  const scale = recipe.data.scale;
  if (!scale) return null;
  const control = node('div', null, 'scale-control');
  const label = node('label', scale.type === 'flour' ? (lang === 'en' ? 'Flour (g)' : '面粉重量（g）') : (lang === 'en' ? 'Scale ingredients' : '换算材料'));
  let picker;
  let applyButton;
  if (scale.type === 'flour') {
    picker = node('input');
    picker.type = 'number';
    picker.min = '1';
    picker.step = '1';
    picker.value = String(recipe.scaleChoice ?? scale.baseFlourGrams);
    picker.setAttribute('aria-label', label.textContent);
    const apply = () => {
      const next = Number(picker.value);
      if (!Number.isFinite(next) || next < 1) { picker.value = String(recipe.scaleChoice ?? scale.baseFlourGrams); return; }
      recipe.scaleChoice = next;
      renderStructured(recipe, language);
    };
    picker.addEventListener('keydown', event => { if (event.key === 'Enter') apply(); });
    applyButton = node('button', lang === 'en' ? 'Calculate' : '计算');
    applyButton.type = 'button';
    applyButton.addEventListener('click', apply);
  } else {
    picker = node('select');
    picker.setAttribute('aria-label', label.textContent);
    const choices = scale.type === 'round_pan' ? scale.diametersIn : scale.multipliers;
    const current = recipe.scaleChoice ?? (scale.type === 'round_pan' ? scale.baseDiameterIn : 1);
    for (const choice of choices) {
      let text;
      if (scale.type === 'round_pan') text = lang === 'en' ? `One ${choice}-inch round pan` : `一个 ${choice} 寸圆模`;
      else {
        const count = scale.baseYield.count * choice;
        const unit = localized(scale.baseYield.unit, lang);
        text = `${count} ${unit}`;
      }
      const option = node('option', text);
      option.value = String(choice);
      picker.append(option);
    }
    picker.value = String(current);
    picker.addEventListener('change', () => {
      recipe.scaleChoice = Number(picker.value);
      renderStructured(recipe, language);
    });
  }
  const base = scale.type === 'round_pan' ? `${scale.baseDiameterIn}${lang === 'en' ? '-inch pan' : ' 寸模具'}` : scale.type === 'flour' ? `${scale.baseFlourGrams} g ${lang === 'en' ? 'flour' : '面粉'}` : `${scale.baseYield.count} ${localized(scale.baseYield.unit, lang)}`;
  const warning = node('p', lang === 'en'
    ? `Scaled from ${base}. Only confirmed amounts change; original notes, uncertain amounts, oven settings and timing remain as recorded. For fractional eggs, separate and weigh the needed portion. Pan depth and filling may need adjustment.`
    : `基于${base}换算已确认用量；原方笔记、待核材料、烤温与时间不变。非整数个鸡蛋请分开打散称重；模具深度和馅量按实际调整。`, 'scale-warning');
  control.append(label, picker, ...(applyButton ? [applyButton] : []), warning);
  return control;
}

function renderStructured(recipe, lang) {
  const { element, summary, body, data } = recipe;
  const labels = node('div', null, 'labels');
  labels.append(node('span', (lang === 'en' ? categoryNames : categoryNamesZh)[data.category] || data.category));
  const status = node('span', localized(data.displayStatus, lang), 'status');
  if (data.status === 'planned') status.classList.add('planned');
  labels.append(status);
  summary.replaceChildren(labels, node('h2', localized(data.title, lang)), node('p', localized(data.summary, lang), 'metadata'));

  const columns = node('div', null, 'columns');
  const ingredients = node('div');
  const method = node('div');
  ingredients.append(node('h3', lang === 'en' ? 'Ingredients' : '材料'));
  const factor = scaleFactor(recipe);
  for (const section of data.sections) {
    const sectionTitle = localized(section.title, lang);
    if (sectionTitle !== (lang === 'en' ? 'Ingredients' : '材料')) ingredients.append(node('h4', sectionTitle + (section.scalable === false && factor !== 1 ? (lang === 'en' ? ' · reference only' : ' · 仅供参考') : '')));
    const list = node('dl');
    for (const ingredient of section.ingredients) {
      const row = node('div');
      row.append(node('dt', localized(ingredient.name, lang)),
        node('dd', [formatQuantity(ingredient, section.scalable === false ? 1 : factor, lang), localized(ingredient.detail, lang)].filter(Boolean).join(' · ')));
      list.append(row);
    }
    ingredients.append(list);
  }
  if (data.steps.length) {
    method.append(node('h3', lang === 'en' ? 'Original method & baking record' : '原方做法与烘烤记录'));
    const list = node('ol');
    for (const step of data.steps) list.append(node('li', localized(step, lang)));
    method.append(list);
  }
  if (data.notes.length) {
    method.append(node('h3', lang === 'en' ? 'Notes' : '笔记'));
    for (const note of data.notes) method.append(node('p', localized(note, lang), 'note'));
  }
  columns.append(ingredients, method);
  const control = scaleControl(recipe, lang);
  body.replaceChildren(...(control ? [control, columns] : [columns]));
}

async function loadRecipeData() {
  const manifestResponse = await fetch('recipes/index.json?v=3');
  if (!manifestResponse.ok) throw new Error('Could not load recipe index');
  const manifest = await manifestResponse.json();
  if (manifest.version !== 1 || !Array.isArray(manifest.ids) || new Set(manifest.ids).size !== manifest.ids.length) {
    throw new Error('Invalid recipe index');
  }
  const data = await Promise.all(manifest.ids.map(async id => {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Invalid recipe ID: ${id}`);
    const response = await fetch(`recipes/${id}.json?v=3`);
    if (!response.ok) throw new Error(`Could not load ${id}`);
    const recipe = await response.json();
    if (recipe.id !== id || !recipe.displayStatus?.zh || !recipe.displayStatus?.en) {
      throw new Error(`Invalid recipe data: ${id}`);
    }
    return recipe;
  }));
  for (const entry of data) {
    const element = document.createElement('details');
    element.className = 'recipe';
    element.id = entry.id;
    element.dataset.category = entry.category;
    element.dataset.status = entry.status;
    const summary = document.createElement('summary');
    const body = node('div', null, 'recipe-body');
    element.append(summary, body);
    recipeContainer.append(element);
    const recipe = { element, summary, body, data: entry, scaleChoice: null,
      searchText: JSON.stringify(entry).toLocaleLowerCase().replace(/\s+/g, '') };
    recipes.push(recipe);
    renderStructured(recipe, language);
  }
}

function updateRecipes() {
  const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  let visible = 0;
  for (const recipe of recipes) {
    const { element, searchText } = recipe;
    const { category, status } = element.dataset;
    const matchesFilter = active === 'all' || active === category || active === status;
    element.hidden = !(matchesFilter && terms.every(term => searchText.includes(term)));
    if (!element.hidden) visible += 1;
  }
  count.textContent = language === 'en' ? `${visible} recipes` : `${visible} 份配方`;
  empty.hidden = visible > 0;
}

function openLinkedRecipe() {
  const recipe = recipes.find(({ element }) => '#' + element.id === location.hash)?.element;
  if (recipe) {
    if (recipe.hidden) {
      search.value = '';
      filters[0].click();
    }
    recipe.open = true;
    recipe.scrollIntoView({ block: 'start' });
  }
}

function setLanguage(next) {
  if (next === language) return;
  for (const recipe of recipes) renderStructured(recipe, next);
    language = next;
    document.documentElement.lang = next === 'en' ? 'en' : 'zh-Hans';
    document.title = next === 'en' ? 'My Baking Recipes' : '我的烘焙配方';
    document.querySelector('h1').textContent = document.title;
    heroDescription.textContent = next === 'en' ? 'Breads, Basque cheesecakes & things to bake next' : '吐司、巴斯克和下次想烤的点心';
    document.querySelector('label[for="search"]').textContent = next === 'en' ? 'Find a recipe' : '找配方';
    search.placeholder = next === 'en' ? 'Try black sesame, yogurt, poolish' : '试试输入 黑芝麻、酸奶、波兰种';
    document.querySelector('.filters').setAttribute('aria-label', next === 'en' ? 'Filter recipes' : '筛选配方');
    for (const filter of filters) filter.textContent = filterNames[next][filter.dataset.filter];
    empty.textContent = next === 'en' ? 'No recipes found. Try another search or choose All.' : '没有找到配方。试试换个关键词或点「全部」。';
    languageSwitch.textContent = next === 'en' ? '中文' : 'English';
    languageSwitch.lang = next === 'en' ? 'zh' : 'en';
    languageSwitch.setAttribute('aria-label', next === 'en' ? '切换到中文' : 'Switch to English');
    try { localStorage.setItem('baking-recipes-language', next); } catch (_) { /* Storage may be unavailable. */ }
    updateRecipes();
    openLinkedRecipe();
}

for (const filter of filters) {
  filter.addEventListener('click', () => {
    active = filter.dataset.filter;
    for (const button of filters) button.setAttribute('aria-pressed', String(button === filter));
    updateRecipes();
  });
}
search.addEventListener('input', updateRecipes);
languageSwitch.addEventListener('click', () => setLanguage(language === 'zh' ? 'en' : 'zh'));
window.addEventListener('hashchange', openLinkedRecipe);
languageSwitch.disabled = true;
loadRecipeData().then(() => {
  loadMessage.hidden = true;
  document.querySelector('.toolbar').hidden = false;
  languageSwitch.disabled = false;
  updateRecipes();
  openLinkedRecipe();
  try {
    if (localStorage.getItem('baking-recipes-language') === 'en') setLanguage('en');
  } catch (_) { /* Chinese remains the default. */ }
}).catch(error => {
  loadMessage.textContent = '配方加载失败，请刷新页面重试。 / Could not load recipes. Please refresh.';
  languageMessage.textContent = '配方文件暂时不可用。 / Recipe files are unavailable.';
  console.error(error);
});
