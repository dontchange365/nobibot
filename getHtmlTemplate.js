// getHtmlTemplate.js
function getHtmlTemplate(title, bodyContent) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <link rel="stylesheet" href="/style.css" />
      <style>
        .variable-dropdown {
          position: absolute;
          background: #fff;
          border: 1px solid #ddd;
          max-height: 200px;
          overflow-y: auto;
          z-index: 999;
          width: 100%;
          display: none;
          font-family: 'Inter', sans-serif;
        }
        .variable-dropdown li {
          padding: 8px 12px;
          cursor: pointer;
          border-bottom: 1px solid #eee;
        }
        .variable-dropdown li:hover {
          background-color: #f0f0f0;
        }
      </style>
    </head>
    <body>
      ${bodyContent}

      <script>
        const allVariables = [
          "%message%", "%message_LENGTH%", "%capturing_group_ID%",
          "%name%", "%first_name%", "%last_name%", "%chat_name%",
          "%date%", "%time%", "%hour%", "%hour_short%", "%hour_of_day%", "%hour_of_day_short%",
          "%minute%", "%second%", "%millisecond%", "%am/pm%",
          "%day_of_month%", "%day_of_month_short%", "%month%", "%month_short%",
          "%month_name%", "%month_name_short%", "%year%", "%year_short%",
          "%day_of_week%", "%day_of_week_short%", "%rule_id%",
          "%rndm_num_A_B%", "%rndm_custom_LENGTH_A,B,C%",
          "%rndm_abc_lower_LENGTH%", "%rndm_abc_upper_LENGTH%", "%rndm_abc_LENGTH%",
          "%rndm_abcnum_lower_LENGTH%", "%rndm_abcnum_upper_LENGTH%", "%rndm_abcnum_LENGTH%",
          "%rndm_ascii_LENGTH%", "%rndm_symbol_LENGTH%", "%rndm_grawlix_LENGTH%"
        ];

        function toggleVariableList() {
          const list = document.getElementById('existingVars');
          list.innerHTML = '';
          allVariables.forEach(v => {
            const li = document.createElement('li');
            li.innerText = v;
            li.onclick = () => insertVariable(v);
            list.appendChild(li);
          });
          list.style.display = (list.style.display === 'block') ? 'none' : 'block';
        }

        function insertVariable(variable) {
          const activeTextarea = document.activeElement;
          const start = activeTextarea.selectionStart;
          const end = activeTextarea.selectionEnd;
          const text = activeTextarea.value;
          activeTextarea.value = text.substring(0, start) + variable + text.substring(end);
          activeTextarea.focus();
          activeTextarea.selectionEnd = start + variable.length;
          document.getElementById('existingVars').style.display = 'none';
        }

        document.querySelectorAll('textarea').forEach(textarea => {
          const dropdown = document.getElementById('existingVars');
          textarea.addEventListener('input', () => {
            const cursorPos = textarea.selectionStart;
            const textBefore = textarea.value.slice(0, cursorPos);
            const match = textBefore.match(/%[a-zA-Z0-9_]*$/);
            if (match) {
              const query = match[0];
              const filtered = allVariables.filter(v => v.startsWith(query));
              if (filtered.length > 0) {
                dropdown.innerHTML = '';
                filtered.forEach(v => {
                  const li = document.createElement('li');
                  li.innerText = v;
                  li.onclick = () => {
                    const start = textarea.selectionStart - query.length;
                    const end = textarea.selectionStart;
                    textarea.value = textarea.value.slice(0, start) + v + textarea.value.slice(end);
                    textarea.focus();
                    textarea.selectionEnd = start + v.length;
                    dropdown.style.display = 'none';
                  };
                  dropdown.appendChild(li);
                });
                dropdown.style.display = 'block';
                dropdown.style.top = (textarea.offsetTop + textarea.offsetHeight) + 'px';
                dropdown.style.left = textarea.offsetLeft + 'px';
                dropdown.style.width = textarea.offsetWidth + 'px';
              } else {
                dropdown.style.display = 'none';
              }
            } else {
              dropdown.style.display = 'none';
            }
          });

          textarea.addEventListener('blur', () => {
            setTimeout(() => {
              dropdown.style.display = 'none';
            }, 200);
          });
        });
      </script>
    </body>
    </html>
  `;
}
module.exports = getHtmlTemplate;
