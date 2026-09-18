export function icon(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

export const ICONS = {
  capture: icon('<rect x="3" y="7" width="18" height="13" rx="2.5"></rect><path d="M8 7l1.6-2.5h4.8L16 7"></path><circle cx="12" cy="13.5" r="3.4"></circle>'),
  audio: icon('<rect x="9" y="2.5" width="6" height="11" rx="3"></rect><path d="M5.5 11a6.5 6.5 0 0 0 13 0"></path><path d="M12 17.5v3.5M9 21h6"></path>'),
  perf: icon('<path d="M4 15a8 8 0 0 1 16 0"></path><path d="M12 15l3.5-4.5"></path><circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"></circle>'),
  chat: icon('<path d="M4 5.5h16v10.5H9l-4 3.5v-3.5H4z"></path>'),
  social: icon('<circle cx="8.5" cy="9" r="2.7"></circle><circle cx="16" cy="10.5" r="2.2"></circle><path d="M3.5 19c0-3 2.2-5 5-5s5 2 5 5"></path><path d="M13.5 15.3c2.3.4 3.7 2 3.7 3.7"></path>'),
  star: icon('<path d="M12 3.5l2.4 5 5.4.6-4 3.8 1 5.4L12 15.8l-4.8 2.5 1-5.4-4-3.8 5.4-.6z"></path>'),
  browser: icon('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>'),
  testWidget: icon('<rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18M9 21V9"></path>'),
  lab: icon('<path d="M10 2v7.527a2 2 0 0 1-.586 1.414l-4.142 4.142a2 2 0 0 0-.586 1.414V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.113a2 2 0 0 0-.586-1.414l-4.142-4.142A2 2 0 0 1 14 9.527V2"></path><line x1="8.5" y1="2" x2="15.5" y2="2"></line><line x1="7" y1="13" x2="17" y2="13"></line>'),
  close: icon('<path d="M6 6l12 12M18 6L6 18"></path>'),
  back: icon('<path d="M19 12H5M12 19l-7-7 7-7"></path>'),
  forward: icon('<path d="M5 12h14M12 5l7 7-7 7"></path>'),
  reload: icon('<path d="M23 4v6h-6M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>'),
  home: icon('<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>'),
  external: icon('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line>'),
  gear: icon('<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>'),
  search: icon('<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>'),
  games: icon('<rect x="2" y="7" width="20" height="10" rx="5"></rect><line x1="7" y1="10" x2="7" y2="14"></line><line x1="5" y1="12" x2="9" y2="12"></line><circle cx="15" cy="10.5" r="1" fill="currentColor" stroke="none"></circle><circle cx="17.5" cy="13" r="1" fill="currentColor" stroke="none"></circle>'),
  music: icon('<path d="M9 18V5l11-2v13"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="17.5" cy="16" r="2.5"></circle>'),
  musicPlay: icon('<path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" stroke="none"></path>'),
  musicPause: icon('<rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"></rect><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none"></rect>'),
  musicPrev: icon('<path d="M18 6v12l-8.5-6z" fill="currentColor" stroke="none"></path><rect x="5.5" y="6" width="2.5" height="12" rx="1" fill="currentColor" stroke="none"></rect>'),
  musicNext: icon('<path d="M6 6v12l8.5-6z" fill="currentColor" stroke="none"></path><rect x="16" y="6" width="2.5" height="12" rx="1" fill="currentColor" stroke="none"></rect>'),
  musicVolume: icon('<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"></path><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"></path><path d="M18 7a7 7 0 0 1 0 10"></path>'),
  maximize: icon('<path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M16 3h3a2 2 0 0 1 2 2v3"></path><path d="M8 21H5a2 2 0 0 1-2-2v-3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>'),
  minimize: icon('<path d="M9 3v3a2 2 0 0 1-2 2H4"></path><path d="M15 3v3a2 2 0 0 0 2 2h3"></path><path d="M9 21v-3a2 2 0 0 0-2-2H4"></path><path d="M15 21v-3a2 2 0 0 1 2-2h3"></path>')
};
