import {OPP} from './js/OPP.js'

/* ########################################
Main
######################################## */

var version = 114;

var baseurl = document.getElementById("oppjs").getAttribute('src').split('/').slice(0, -1).join('/');
if (baseurl.length == 0) {
  baseurl = ".";
}

var options = {
  'version': version,
  'baseurl': baseurl
}

if (typeof themesJsonUrl == 'undefined') {
  var themesJsonUrl = `${baseurl}/themes.json?v=${version}`;
}
if (typeof providersJsonUrl == 'undefined') {
  var providersJsonUrl = `${baseurl}/providers.json?v=${version}`;
}

//make sure json MIME type exists because it sould be provided when loading local file
$.ajaxSetup({beforeSend: function(xhr){
  if (xhr.overrideMimeType)
  {
    xhr.overrideMimeType("application/json");
  }
}
});


$(document).ready(function() {

  //Search if the target theme is identified in the url
  let params = new URL(window.location).searchParams;
  let themeKey = params.get('theme');
  if (!themeKey){
    //maybe the theme is declared through an url alias
    let url = window.location.pathname;
    url = url.endsWith('/') ? url.slice(0, -1) : url;
    themeKey = url.split("/").pop();
  }

  loading = new Spinner({
    top: '50%', left: '50%',
    animation: 'spinner-line-shrink',
    radius:20,
    scale: 2,
    length: 0
  }).spin(document.getElementById('container'));

  var providers, settings;
  $.when(
    $.getJSON(providersJsonUrl, function (data) {
      providers = data;
    }),
    $.getJSON(themesJsonUrl, function (data) {
      if (themeKey){
        settings = data.find(theme => theme.key == themeKey);
      }
      if (!themeKey || !settings){
        //test if this url domain is associated to a specific theme
        settings = data.filter(theme => "domains" in theme).find(theme => {
          return theme.domains.some(domain => domain == window.location.hostname);
        });
        //if not return the default theme
        if (!settings){
          settings = data.find(theme => Boolean(theme.default));
        }
      }
    })
  ).then(function(){
    window.opp = new OPP(providers, settings, options);
    window.opp.loading.then(function(){
      loading.stop();
      $('#loading').fadeOut(1000);
    });
  });

  //history back/forward buttons
  $(window).bind('popstate', function(event) {
    opp.refresh();
  });

});
