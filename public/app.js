const $ = document.querySelector.bind(document);

function selectCriteria(event) {
  const numChecked = Array.from(event.target.form['criteria[]'])
    .filter(c => c.checked)
    .length;

  $('#criteriaCount').innerText = numChecked;
  $('#submit').disabled = numChecked !== 24;
  $('#progressBar').style.maxWidth = numChecked / .24 + '%';
}

document.addEventListener('DOMContentLoaded', () => {
  Array.from(document.querySelectorAll('[name="criteria[]"]'))
    .forEach(e => e.addEventListener('change', event => selectCriteria(event)));
});
