import './style.css'

const form = document.querySelector('#search')

form.addEventListener('submit', (event) => {
  event.preventDefault()
  const query = new FormData(form).get('query').trim()
  const summary = document.querySelector('#summary p')
  summary.textContent = query
    ? `「${query}」の予報計算は、まだつながっていません。`
    : '地点を入力してください。'
})
