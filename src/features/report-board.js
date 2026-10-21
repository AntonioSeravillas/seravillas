/* Jarvis-themed Reports page (classic script, after reports.js and revenue-reports.js). It shows the existing report
   itself (renderBookingReport): the same records, calculations, filters, chart, drilldowns and wording, so no figure is
   recalculated here. Only presentation differs; its element ids get a jv- prefix so they never collide with the
   workspace screen. The filters (reportYear, reportMonth, reportVilla, ...) stay shared with the workspace, as before.
   Reading a report never changes a record. */
(function(){
  let scope='';
  const prefix=html=>html.replace(/\b(id|for|aria-labelledby|aria-describedby|aria-controls)="report-/g,'$1="jv-report-');
  function render(host){
    if(!host)return;
    /* A new year, month or villa starts at the top, like the workspace screen; other updates keep the place. */
    const key=[reportYear,reportMonth,reportVilla].join('|'),scroller=host.querySelector('.jc-body'),top=scroller&&key===scope?scroller.scrollTop:0;scope=key;
    host.innerHTML='<div class="jc-body jr-body">'+prefix(renderBookingReport())+'</div>';
    const next=host.querySelector('.jc-body');if(next&&top)next.scrollTop=top;
  }
  function bind(){}
  window.SV_REPORTS_VIEW={render,bind,prefix};
})();
