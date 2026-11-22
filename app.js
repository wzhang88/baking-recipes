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
  if (scale.type === 'round_pan') {
    const diameter = recipe.scaleChoice ?? scale.baseDiameterIn;
    return (diameter / scale.baseDiameterIn) ** 2 / scale.basePanCount;
  }
  return recipe.scaleChoice ?? 1;
}

function formatQuantity(ingredient, factor, lang) {
  const original = localized(ingredient.amount, lang);
  if (factor === 1) return original;
  if (!ingredient.quantity) return original + (lang === 'en' ? ' · original amount; adjust by taste' : ' · 原记录，未换算');
  const { value, unit, approxGramPerEgg } = ingredient.quantity;
  const scaled = value * factor;
  const rounded = Math.round(scaled * 10) / 10;
  if (unit === 'egg') {
    const eggs = lang === 'en' ? `${rounded} eggs` : `${rounded} 个`;
    const grams = Math.round(scaled * approxGramPerEgg);
    return lang === 'en' ? `about ${eggs} (about ${grams} g beaten egg)` : `约 ${eggs}（打散后约 ${grams} g）`;
  }
  return `${rounded} ${unit}`;
}

function scaleControl(recipe, lang) {
  const scale = recipe.data.scale;
  if (!scale) return null;
  const control = node('div', null, 'scale-control');
  const label = node('label', lang === 'en' ? 'Scale ingredients' : '换算材料');
  const select = node('select');
  select.setAttribute('aria-label', label.textContent);
  const choices = scale.type === 'round_pan' ? scale.diametersIn : scale.multipliers;
  const current = recipe.scaleChoice ?? (scale.type === 'round_pan' ? scale.baseDiameterIn : 1);
  for (const choice of choices) {
    let text;
    if (scale.type === 'round_pan') text = lang === 'en' ? `One ${choice}-inch round pan` : `一个 ${choice} 寸圆模`;
    else {
      const count = scale.baseYield.count * choice;
      text = lang === 'en' ? `${count} × 450 g loaf pan${count === 1 ? '' : 's'}` : `${count} 个 450 g 吐司模`;
    }
    const option = node('option', text);
    option.value = String(choice);
    select.append(option);
  }
  select.value = String(current);
  select.addEventListener('change', () => {
    recipe.scaleChoice = Number(select.value);
    renderStructured(recipe, language);
  });
  const warning = node('p', lang === 'en'
    ? `Scaled from ${scale.type === 'round_pan' ? `${scale.baseDiameterIn}-inch` : `${scale.baseYield.count} loaves`}. Ingredients only; the method, oven temperature and baking time describe the original batch. ${scale.type === 'round_pan' ? 'One egg is estimated as 50 g without the shell.' : 'Judge proofing and doneness in your oven.'}`
    : `基于${scale.type === 'round_pan' ? `${scale.baseDiameterIn} 寸` : `${scale.baseYield.count} 条`}原方换算材料；步骤、烤温和时间仍为原记录。${scale.type === 'round_pan' ? '鸡蛋按去壳每个约 50 g 估算。' : '发酵与出炉状态按实际观察。'}`, 'scale-warning');
  control.append(label, select, warning);
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
    if (sectionTitle !== (lang === 'en' ? 'Ingredients' : '材料')) ingredients.append(node('h4', sectionTitle));
    const list = node('dl');
    for (const ingredient of section.ingredients) {
      const row = node('div');
      row.append(node('dt', localized(ingredient.name, lang)),
        node('dd', [formatQuantity(ingredient, factor, lang), localized(ingredient.detail, lang)].filter(Boolean).join(' · ')));
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
