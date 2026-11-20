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
    translatedText: '', data: null
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

function renderEnglish(recipe) {
  const { element, summary, body, originalStatus, data } = recipe;
  const labels = node('div', null, 'labels');
  labels.append(node('span', categoryNames[element.dataset.category] || element.dataset.category));
  const status = node('span', statusNames[originalStatus] || 'Recipe notes', 'status');
  if (element.dataset.status === 'planned') status.classList.add('planned');
  labels.append(status);
  summary.replaceChildren(labels, node('h2', data.title.en), node('p', data.summary.en, 'metadata'));

  const columns = node('div', null, 'columns');
  const ingredients = node('div');
  const method = node('div');
  ingredients.append(node('h3', 'Ingredients'));
  for (const section of data.sections) {
    ingredients.append(node('h4', localized(section.title, 'en')));
    const list = node('dl');
    for (const ingredient of section.ingredients) {
      const row = node('div');
      row.append(node('dt', localized(ingredient.name, 'en')),
        node('dd', [localized(ingredient.amount, 'en'), localized(ingredient.detail, 'en')].filter(Boolean).join(' · ')));
      list.append(row);
    }
    ingredients.append(list);
  }
  if (data.steps.length) {
    method.append(node('h3', 'Method & baking record'));
    const list = node('ol');
    for (const step of data.steps) list.append(node('li', localized(step, 'en')));
    method.append(list);
  }
  if (data.notes.length) {
    method.append(node('h3', 'Notes'));
    for (const note of data.notes) method.append(node('p', localized(note, 'en'), 'note'));
  }
  columns.append(ingredients, method);
  body.replaceChildren(columns);
}

function renderChinese(recipe) {
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
