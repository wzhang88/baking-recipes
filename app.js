const search = document.querySelector('#search');
const filters = [...document.querySelectorAll('[data-filter]')];
const count = document.querySelector('.count');
const empty = document.querySelector('.empty');
const languageSwitch = document.querySelector('#language-switch');
const languageMessage = document.querySelector('#language-message');
const heroDescription = document.querySelector('#hero-description');

const categoryNames = { bread: 'Bread', cake: 'Cakes', snack: 'Treats' };
const statusNames = {
  '已试做': 'Baked', '待试做': 'To try', '旧配方': 'Older recipe',
  '备忘录配方': 'Recipe notes', '备忘录配方 · 待核': 'Notes · to verify',
  '备忘录配方 · 烤温待核': 'Notes · oven temperature unconfirmed',
  '备忘录 · 步骤待补': 'Notes · method incomplete',
  '备忘录 · 部分待核': 'Notes · some details unconfirmed',
  '手写配方': 'Handwritten recipe',
  '手写配方 · 用途待核': 'Handwritten · purpose unconfirmed',
  '手写配方 · 部分待辨': 'Handwritten · some details unclear',
  '手写配方已核对': 'Handwritten recipe reviewed',
  '配方已整理': 'Recipe organized', '黑芝麻已试做': 'Black sesame version baked'
};
const filterNames = {
  zh: { all: '全部', bread: '面包', cake: '蛋糕', snack: '点心', planned: '待试做' },
  en: { all: 'All', bread: 'Bread', cake: 'Cakes', snack: 'Treats', planned: 'To try' }
};

const recipes = [...document.querySelectorAll('.recipe')].map(element => {
  const summary = element.querySelector('summary');
  const body = element.querySelector('.recipe-body');
  return {
    element, summary, body,
    originalSummary: [...summary.childNodes].map(node => node.cloneNode(true)),
    originalBody: [...body.childNodes].map(node => node.cloneNode(true)),
    originalStatus: summary.querySelector('.status').textContent.trim(),
    originalText: element.textContent.toLocaleLowerCase().replace(/\s+/g, ''),
    translatedText: '', data: null, scaleChoice: null
  };
});

let active = 'all';
let language = 'zh';
let recipeDataPromise;

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
  const { element, summary, body, originalStatus, data } = recipe;
  if (lang === 'en') {
    const labels = node('div', null, 'labels');
    labels.append(node('span', categoryNames[element.dataset.category] || element.dataset.category));
    const status = node('span', statusNames[originalStatus] || 'Recipe notes', 'status');
    if (element.dataset.status === 'planned') status.classList.add('planned');
    labels.append(status);
    summary.replaceChildren(labels, node('h2', data.title.en), node('p', data.summary.en, 'metadata'));
  } else {
    summary.replaceChildren(...recipe.originalSummary.map(child => child.cloneNode(true)));
  }

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

function renderEnglish(recipe) {
  renderStructured(recipe, 'en');
}

function renderChinese(recipe) {
  if (recipe.data?.scale) return renderStructured(recipe, 'zh');
  recipe.summary.replaceChildren(...recipe.originalSummary.map(child => child.cloneNode(true)));
  recipe.body.replaceChildren(...recipe.originalBody.map(child => child.cloneNode(true)));
}

async function loadRecipeData() {
  if (!recipeDataPromise) {
    recipeDataPromise = Promise.all(recipes.map(async recipe => {
      const response = await fetch(`recipes/${encodeURIComponent(recipe.element.id)}.json`);
      if (!response.ok) throw new Error(`Could not load ${recipe.element.id}`);
      const data = await response.json();
      if (data.id !== recipe.element.id) throw new Error(`Unexpected recipe ID: ${data.id}`);
      return data;
    })).then(all => {
      all.forEach((data, index) => {
        recipes[index].data = data;
        recipes[index].translatedText = JSON.stringify(data).toLocaleLowerCase().replace(/\s+/g, '');
      });
      if (language === 'zh') for (const recipe of recipes) {
        if (recipe.data.scale) renderChinese(recipe);
      }
    }).catch(error => {
      recipeDataPromise = undefined;
      throw error;
    });
  }
  return recipeDataPromise;
}

function updateRecipes() {
  const terms = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  let visible = 0;
  for (const recipe of recipes) {
    const { element, originalText, translatedText } = recipe;
    const { category, status } = element.dataset;
    const matchesFilter = active === 'all' || active === category || active === status;
    const text = originalText + translatedText;
    element.hidden = !(matchesFilter && terms.every(term => text.includes(term)));
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

async function setLanguage(next) {
  if (next === language) return;
  languageSwitch.disabled = true;
  languageMessage.textContent = next === 'en' ? 'Loading translations…' : '';
  try {
    if (next === 'en') await loadRecipeData();
    for (const recipe of recipes) {
      if (next === 'en') renderEnglish(recipe);
      else renderChinese(recipe);
    }
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
    languageMessage.textContent = '';
    updateRecipes();
    openLinkedRecipe();
  } catch (error) {
    languageMessage.textContent = 'Translations could not load. Please try again. / 英文内容加载失败，请重试。';
    console.error(error);
  } finally {
    languageSwitch.disabled = false;
  }
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
document.querySelector('.toolbar').hidden = false;
updateRecipes();
openLinkedRecipe();
try {
  if (localStorage.getItem('baking-recipes-language') === 'en') setLanguage('en');
} catch (_) { /* Chinese remains the default. */ }
loadRecipeData().then(updateRecipes).catch(() => { /* Chinese search still works offline. */ });
