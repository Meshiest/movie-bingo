const $ = document.querySelector.bind(document);

function selectCriteria(event) {
  const numChecked = Array.from(event.target.form['criteria[]'])
    .filter(c => c.checked)
    .length;

  $('#criteriaCount').innerText = numChecked;
  $('#submit').disabled = numChecked !== 24;
  $('#progressBar').style.maxWidth = numChecked / .24 + '%';
}