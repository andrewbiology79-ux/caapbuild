package com.questionbank.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.questionbank.app.QuestionBankApp
import com.questionbank.app.ui.backup.BackupScreen
import com.questionbank.app.ui.backup.BackupViewModel
import com.questionbank.app.ui.backup.backupStatusLine
import com.questionbank.app.ui.hierarchy.HierarchyLabels
import com.questionbank.app.ui.hierarchy.HierarchyListScreen
import com.questionbank.app.ui.hierarchy.HierarchyListViewModel
import com.questionbank.app.ui.home.HomeScreen
import com.questionbank.app.ui.question.QuestionEditorScreen
import com.questionbank.app.ui.question.QuestionEditorViewModel
import com.questionbank.app.ui.question.QuestionListScreen
import com.questionbank.app.ui.question.QuestionListViewModel
import kotlinx.coroutines.flow.flowOf

/** Route names. Add one constant per destination; keep them stable (they appear in saved state). */
object Routes {
    const val HOME = "home"
    const val BACKUP = "backup"
    const val SUBJECTS = "type_cq/subjects"
    const val CHAPTERS = "type_cq/subjects/{subjectId}/chapters"
    const val TOPICS = "type_cq/chapters/{chapterId}/topics"
    const val QUESTIONS = "type_cq/topics/{topicId}/questions"
    const val QUESTION_EDITOR = "type_cq/topics/{topicId}/questions/new"
    const val SAVED_COUNT_KEY = "savedCount"

    fun chapters(subjectId: String) = "type_cq/subjects/$subjectId/chapters"
    fun topics(chapterId: String) = "type_cq/chapters/$chapterId/topics"
    fun questions(topicId: String) = "type_cq/topics/$topicId/questions"
    fun questionEditor(topicId: String) = "type_cq/topics/$topicId/questions/new"
}

private val SUBJECT_LABELS = HierarchyLabels("বিষয়", "+ বিষয়", "নতুন বিষয়")
private val CHAPTER_LABELS = HierarchyLabels("অধ্যায়", "+ অধ্যায়", "নতুন অধ্যায়")
private val TOPIC_LABELS = HierarchyLabels("টপিক", "+ টপিক", "নতুন টপিক")

@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    val container = (LocalContext.current.applicationContext as QuestionBankApp).container
    val repo = container.typeCqHierarchy
    val questionRepo = container.typeCqQuestions

    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                onOpenTypeCq = { navController.navigate(Routes.SUBJECTS) },
                onOpenBackup = { navController.navigate(Routes.BACKUP) },
                backupStatus = backupStatusLine(container.backupPrefs),
            )
        }

        composable(Routes.BACKUP) {
            val vm: BackupViewModel = viewModel(
                factory = BackupViewModel.factory { BackupViewModel(container.backup, container.backupPrefs) }
            )
            BackupScreen(viewModel = vm, onBack = { navController.popBackStack() })
        }

        composable(Routes.SUBJECTS) {
            val vm: HierarchyListViewModel = viewModel(
                factory = HierarchyListViewModel.factory {
                    HierarchyListViewModel(repo.observeSubjects(), flowOf(null)) { name -> repo.addSubject(name) }
                }
            )
            HierarchyListScreen(
                viewModel = vm,
                labels = SUBJECT_LABELS,
                onItemClick = { navController.navigate(Routes.chapters(it.id)) },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.CHAPTERS,
            arguments = listOf(navArgument("subjectId") { type = NavType.StringType }),
        ) { entry ->
            val subjectId = entry.arguments?.getString("subjectId").orEmpty()
            val vm: HierarchyListViewModel = viewModel(
                factory = HierarchyListViewModel.factory {
                    HierarchyListViewModel(
                        repo.observeChapters(subjectId),
                        repo.observeSubject(subjectId),
                    ) { name -> repo.addChapter(subjectId, name) }
                }
            )
            HierarchyListScreen(
                viewModel = vm,
                labels = CHAPTER_LABELS,
                onItemClick = { navController.navigate(Routes.topics(it.id)) },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.TOPICS,
            arguments = listOf(navArgument("chapterId") { type = NavType.StringType }),
        ) { entry ->
            val chapterId = entry.arguments?.getString("chapterId").orEmpty()
            val vm: HierarchyListViewModel = viewModel(
                factory = HierarchyListViewModel.factory {
                    HierarchyListViewModel(
                        repo.observeTopics(chapterId),
                        repo.observeChapter(chapterId),
                    ) { name -> repo.addTopic(chapterId, name) }
                }
            )
            HierarchyListScreen(
                viewModel = vm,
                labels = TOPIC_LABELS,
                onItemClick = { navController.navigate(Routes.questions(it.id)) },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.QUESTIONS,
            arguments = listOf(navArgument("topicId") { type = NavType.StringType }),
        ) { entry ->
            val topicId = entry.arguments?.getString("topicId").orEmpty()
            val vm: QuestionListViewModel = viewModel(
                factory = QuestionListViewModel.factory { QuestionListViewModel(topicId, questionRepo) }
            )
            val savedCount by entry.savedStateHandle.getStateFlow(Routes.SAVED_COUNT_KEY, 0).collectAsState()
            QuestionListScreen(
                viewModel = vm,
                savedCount = savedCount,
                onSavedShown = { entry.savedStateHandle[Routes.SAVED_COUNT_KEY] = 0 },
                onAdd = { navController.navigate(Routes.questionEditor(topicId)) },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.QUESTION_EDITOR,
            arguments = listOf(navArgument("topicId") { type = NavType.StringType }),
        ) { entry ->
            val topicId = entry.arguments?.getString("topicId").orEmpty()
            val vm: QuestionEditorViewModel = viewModel(
                factory = QuestionEditorViewModel.factory {
                    QuestionEditorViewModel(topicId, questionRepo, container.appScope)
                }
            )
            QuestionEditorScreen(
                viewModel = vm,
                onSaved = { count ->
                    navController.previousBackStackEntry?.savedStateHandle?.set(Routes.SAVED_COUNT_KEY, count)
                    navController.popBackStack()
                },
                onBack = { navController.popBackStack() },
            )
        }
    }
}
