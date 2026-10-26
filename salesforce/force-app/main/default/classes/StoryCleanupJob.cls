/**
 * Hourly trigger for StoryCleanup. Salesforce blocks deploying a scheduled class or anything
 * it references, so this job looks StoryCleanup up by name and has no compile-time
 * dependencies. Keep it that way; put cleanup logic in StoryCleanup.
 */
public class StoryCleanupJob implements Schedulable {

    public void execute(SchedulableContext context) {
        ((Callable) Type.forName('StoryCleanup').newInstance()).call('run', null);
    }
}