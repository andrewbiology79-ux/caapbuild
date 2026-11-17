package com.questionbank.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.questionbank.app.QuestionBankApp
import com.questionbank.app.ui.hierarchy.HierarchyLabels
import com.questionbank.app.ui.hierarchy.HierarchyListScreen
import com.questionbank.app.ui.hierarchy.HierarchyListViewModel
import com.questionbank.app.ui.home.HomeScreen
import kotlinx.coroutines.flow.flowOf

/** Route names. Add one constant per destination; keep them stable (they appear in saved state). */
object Routes {
    const val HOME = "home"
    const val SUBJECTS = "type_cq/subjects"
    const val CHAPTERS = "type_cq/subjects/{subjectId}/chapters"
    const val TOPICS = "type_cq/chapters/{chapterId}/topics"

    fun chapters(subjectId: String) = "type_cq/subjects/$subjectId/chapters"
    fun topics(chapterId: String) = "type_cq/chapters/$chapterId/topics"
}

private val SUBJECT_LABELS = HierarchyLabels("বিষয়", "+ বিষয়", "নতুন বিষয়")
private val CHAPTER_LABELS = HierarchyLabels("অধ্যায়", "+ অধ্যায়", "নতুন অধ্যায়")
private val TOPIC_LABELS = HierarchyLabels("টপিক", "+ টপিক", "নতুন টপিক")

@Composable
fun AppNavHost() {
    val navController = rememberNavController()
    val container = (LocalContext.current.applicationContext as QuestionBankApp).container
    val repo = container.typeCqHierarchy

    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(onOpenTypeCq = { navController.navigate(Routes.SUBJECTS) })
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
                onItemClick = null,
                onBack = { navController.popBackStack() },
            )
        }
    }
}
