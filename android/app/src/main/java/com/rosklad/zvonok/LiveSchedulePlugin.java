package com.rosklad.zvonok;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.Locale;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Native ongoing notification used by OxygenOS Fluid Cloud / Live Alerts. */
@CapacitorPlugin(name = "LiveSchedule")
public class LiveSchedulePlugin extends Plugin {
    private static final String CHANNEL_ID = "zvonok-live";
    private static final int NOTIFICATION_ID = 260924;

    @PluginMethod
    public void show(PluginCall call) {
        String title = call.getData().optString("title", "Звонок");
        String body = call.getData().optString("body", "");
        String kind = call.getData().optString("kind", "lesson");
        long countdownAt = call.getData().optLong("countdownAt", 0L);
        int progress = Math.max(0, Math.min(100, call.getData().optInt("progress", 0)));

        Context context = getContext();
        ensureChannel(context);

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pendingIntent = launchIntent == null ? null : PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification(
            context, title, body, kind, countdownAt, progress, pendingIntent
        ));
        call.resolve();
    }

    private Notification buildNotification(
        Context context,
        String title,
        String body,
        String kind,
        long countdownAt,
        int progress,
        PendingIntent pendingIntent
    ) {
        boolean hasCountdown = countdownAt > 0;
        String subText = kind.equals("break") ? "Перемена" : "Расписание";

        if (Build.VERSION.SDK_INT >= 36) {
            Notification.Builder builder = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(body)
                .setSubText(subText)
                .setCategory(Notification.CATEGORY_EVENT)
                .setPriority(Notification.PRIORITY_HIGH)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setAutoCancel(false)
                .setShowWhen(hasCountdown)
                .setUsesChronometer(hasCountdown)
                .setChronometerCountDown(hasCountdown)
                .setProgress(100, progress, false)
                .setShortCriticalText(hasCountdown ? formatCountdown(countdownAt) : (kind.equals("break") ? "Перемена" : "Урок"));
            builder.getExtras().putBoolean("android.requestPromotedOngoing", true);
            if (hasCountdown) builder.setWhen(countdownAt);
            if (pendingIntent != null) builder.setContentIntent(pendingIntent);
            return builder.build();
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(body)
            .setSubText(subText)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .setShowWhen(hasCountdown)
            .setUsesChronometer(hasCountdown)
            .setChronometerCountDown(hasCountdown)
            .setProgress(100, progress, false);
        if (hasCountdown) builder.setWhen(countdownAt);
        if (pendingIntent != null) builder.setContentIntent(pendingIntent);
        return builder.build();
    }

    private String formatCountdown(long countdownAt) {
        long remainingSeconds = Math.max(0L, (countdownAt - System.currentTimeMillis()) / 1000L);
        long minutes = remainingSeconds / 60L;
        long seconds = remainingSeconds % 60L;
        return String.format(Locale.US, "%02d:%02d", minutes, seconds);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        call.resolve();
    }

    private void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Живое расписание",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Текущий урок, перемена и countdown");
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }
}
