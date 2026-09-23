package com.opravilko.app.places;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The app's side of arrival reminders: asks for location access (while using
 * the app, then "Allow all the time"), and takes the list of places to watch.
 */
@CapacitorPlugin(
        name = "OpravilkoPlaces",
        permissions = {
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
                @Permission(alias = "background", strings = { Manifest.permission.ACCESS_BACKGROUND_LOCATION }),
        })
public class PlacesPlugin extends Plugin {

    @PluginMethod
    public void checkAccess(PluginCall call) {
        call.resolve(access());
    }

    /** Location first; Android only offers "Allow all the time" as a second step. */
    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "afterLocation");
        } else {
            afterLocation(call);
        }
    }

    @PermissionCallback
    private void afterLocation(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.resolve(access());
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !Geofences.hasBackground(getContext())) {
            requestPermissionForAlias("background", call, "afterBackground");
            return;
        }
        Geofences.register(getContext());
        call.resolve(access());
    }

    @PermissionCallback
    private void afterBackground(PluginCall call) {
        Geofences.register(getContext());
        call.resolve(access());
    }

    /** places: [{ id, title, placeName, projectId, lat, lng }] -- replaces the watched list. */
    @PluginMethod
    public void setPlaces(PluginCall call) {
        JSArray places = call.getArray("places");
        Geofences.save(getContext(), places != null ? places.toString() : "[]");
        int watched = Geofences.register(getContext());
        JSObject result = access();
        result.put("watched", watched);
        call.resolve(result);
    }

    /** The app's settings page, to switch location to "Allow all the time". */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private JSObject access() {
        JSObject r = new JSObject();
        r.put("location", Geofences.hasLocation(getContext()));
        r.put("background", Geofences.hasBackground(getContext()));
        return r;
    }
}
