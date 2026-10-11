function bibleVersionSelClass() {
  this.init = g;
  this.show = a;
  this.hide = b;
  let c = null;
  let f = null;
  function g(h) {
    f = h;
    e();
    d();
  }
  function e() {
    c = new AppUI.Modal("panelObj2");
    c.render(document.body);
    c.setHeader("Bible Version Selection");
    c.setBody(f);
    c.hide();
  }
  function d() {}
  function a() {
    c.show();
  }
  function b() {
    c.hide();
  }
}
function remoteVV_UI_Class() {
  this.init = g;
  this.show = a;
  let b = null;
  let f = null;
  function g(h) {
    f = h;
    e();
    d();
  }
  function e() {
    b = new AppUI.Modal("panelObj3");
    b.render(document.body);
    b.setHeader("Remote Access");
    b.setBody(f);
    b.hide();
  }
  function d() {}
  function a() {
    b.show();
  }
  function c() {
    b.hide();
  }
}
function setup_present_UI_Class() {
  this.init = g;
  this.show = a;
  let b = null;
  let f = null;
  function g(h) {
    f = h;
    e();
    d();
  }
  function e() {
    b = new AppUI.Modal("panelObj4");
    b.render(document.body);
    b.setHeader("Presentation Setup");
    b.setBody(f);
    b.hide();
  }
  function d() {}
  function a() {
    b.show();
  }
  function c() {
    b.hide();
  }
}
function updateVV_UI_Class() {
  this.init = g;
  this.show = a;
  let b = null;
  let f = null;
  function g(h) {
    f = h;
    e();
    d();
  }
  function e() {
    b = new AppUI.Modal("panelObj5");
    b.render(document.body);
    b.setHeader("UECFI Presenter Updates");
    b.setBody(f);
    b.hide();
  }
  function d() {}
  function a() {
    b.show();
  }
  function c() {
    b.hide();
  }
}

